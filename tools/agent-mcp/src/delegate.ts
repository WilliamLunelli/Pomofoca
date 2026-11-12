/**
 * Núcleo: executa um worker (um modelo + ferramentas restritas) e devolve um relatório curto ao gestor.
 */
import { generateText, isStepCount, type LanguageModel } from 'ai';
import {
  MAX_REPORT_CHARS,
  ROLE_LIMITS,
  WORKER_TIMEOUT_MS,
  modelFor,
  repoRoot,
  type ModelSpec,
  type Role,
} from './config.js';
import { changedPaths, enforceWritePolicy, isCliProvider, runCli } from './cli-runner.js';
import { clip, diffStat, fullDiff } from './compress.js';
import { buildTools, type ToolPolicy } from './fs-tools.js';
import { budgetBlock, record } from './ledger.js';
import { resolveModel } from './models.js';
import { systemPrompt } from './roles.js';
import {
  checkpoint,
  isDocPath,
  isProtectedPath,
  isTestPath,
  requireTask,
} from './workspace.js';

export interface DelegateArgs {
  role: Role;
  taskId?: string;
  instruction: string;
  /** Contexto adicional injetado no prompt (ex.: log de falha para a triagem). */
  extra?: string;
  /** Injeção de dependência para testes (modelo simulado). Em produção: resolveModel. */
  modelResolver?: (spec: ModelSpec) => LanguageModel;
}

export interface DelegateResult {
  text: string;
  isError: boolean;
}

const NEEDS_TASK: Role[] = [
  'programador',
  'testador',
  'revisor',
  'seguranca',
  'documentacao',
];
const WRITES: Role[] = ['programador', 'testador', 'documentacao'];
const NEEDS_DIFF: Role[] = ['revisor', 'seguranca', 'documentacao'];

export function policyFor(role: Role): ToolPolicy {
  switch (role) {
    case 'programador':
      return {
        canWrite: (p) => !isTestPath(p) && !isProtectedPath(p),
        canRunChecks: true,
      };
    case 'testador':
      return {
        canWrite: (p) => isTestPath(p) && !isProtectedPath(p),
        canRunChecks: true,
      };
    case 'documentacao':
      return { canWrite: (p) => isDocPath(p) && !isProtectedPath(p) };
    default:
      return {};
  }
}

export async function delegate(a: DelegateArgs): Promise<DelegateResult> {
  const started = Date.now();
  const spec = modelFor(a.role);
  const modelLabel = `${spec.provider}:${spec.model}`;
  const budgetKey = a.taskId ?? '_sem-tarefa';

  try {
    if (NEEDS_TASK.includes(a.role) && !a.taskId) {
      return {
        text: `O papel ${a.role} exige taskId (chame tarefa_abrir antes).`,
        isError: true,
      };
    }
    const meta = a.taskId ? requireTask(a.taskId) : undefined;
    const root = meta?.dir ?? repoRoot();

    const blocked = budgetBlock(budgetKey);
    if (blocked) return { text: blocked, isError: true };

    // Revisores e documentação veem o diff completo; garanta que tudo esteja commitado antes.
    let prompt = `# Tarefa\n${a.instruction}`;
    if (a.extra) prompt += `\n\n# Contexto adicional\n${a.extra}`;
    if (meta && NEEDS_DIFF.includes(a.role)) {
      await checkpoint(meta.dir, `agent(checkpoint): antes de ${a.role}`);
      prompt += `\n\n# Diff da tarefa (base..HEAD)\n\`\`\`diff\n${await fullDiff(meta.dir, meta.base)}\n\`\`\``;
    }

    const limits = ROLE_LIMITS[a.role];
    const policy = policyFor(a.role);
    const system = systemPrompt(a.role, root);
    let text: string;
    let steps: number;
    let inTok: number;
    let outTok: number;
    const notes: string[] = [];

    if (isCliProvider(spec.provider)) {
      // Worktree limpo antes do CLI: a política pós-execução só desfaz o que ESTE worker fez.
      if (meta) await checkpoint(meta.dir, `agent(checkpoint): antes de ${a.role}`);
      const before = meta ? [] : await changedPaths(root);
      const r = await runCli({
        spec: { provider: spec.provider, model: spec.model },
        role: a.role,
        root,
        system,
        prompt,
        policy,
        timeoutMs: WORKER_TIMEOUT_MS,
      });
      ({ text, steps, inputTokens: inTok, outputTokens: outTok } = r);
      if (meta) {
        const reverted = await enforceWritePolicy(meta.dir, policy);
        if (reverted.length) {
          notes.push(
            `POLÍTICA: ${reverted.length} arquivo(s) fora da permissão do papel foram desfeitos: ${reverted.slice(0, 10).join(', ')}`,
          );
        }
      } else {
        // Sem worktree (explorador na raiz): não dá para desfazer com segurança; só avisa.
        const novos = (await changedPaths(root)).filter((p) => !before.includes(p));
        if (novos.length) {
          notes.push(
            `ATENÇÃO: o worker alterou arquivos na raiz do repo: ${novos.slice(0, 10).join(', ')}`,
          );
        }
      }
    } else {
      const result = await generateText({
        model: (a.modelResolver ?? resolveModel)(spec),
        system,
        prompt,
        tools: a.role === 'triagem' ? undefined : buildTools(budgetKey, root, policy),
        stopWhen: isStepCount(limits.maxSteps),
        maxOutputTokens: limits.maxOutputTokens,
        abortSignal: AbortSignal.timeout(WORKER_TIMEOUT_MS),
      });
      text = result.text;
      steps = result.steps.length;
      inTok = result.totalUsage?.inputTokens ?? 0;
      outTok = result.totalUsage?.outputTokens ?? 0;
    }

    record({
      ts: new Date().toISOString(),
      taskId: budgetKey,
      role: a.role,
      model: modelLabel,
      inputTokens: inTok,
      outputTokens: outTok,
      ms: Date.now() - started,
      ok: true,
    });

    let changes = '';
    if (meta && WRITES.includes(a.role)) {
      const committed = await checkpoint(
        meta.dir,
        `agent(${a.role}): ${a.instruction.split('\n')[0]?.slice(0, 60) ?? ''}`,
      );
      changes = `\n\nMudanças vs base${committed ? '' : ' (este worker não alterou arquivos)'}:\n${await diffStat(meta.dir, meta.base)}`;
    }

    const body =
      text.trim() ||
      '(o worker não produziu relatório final — provável limite de passos; veja o diffstat)';
    const extraNotes = notes.length ? `\n\n${notes.join('\n')}` : '';
    const header = `[${a.role} · ${modelLabel} · ${steps} passo(s) · ${inTok + outTok} tokens]`;
    return {
      text: `${header}\n${clip(body, MAX_REPORT_CHARS)}${extraNotes}${changes}`,
      isError: false,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    record({
      ts: new Date().toISOString(),
      taskId: budgetKey,
      role: a.role,
      model: modelLabel,
      inputTokens: 0,
      outputTokens: 0,
      ms: Date.now() - started,
      ok: false,
      note: message.slice(0, 300),
    });
    return {
      text: `Falha ao delegar para ${a.role} (${modelLabel}): ${clip(message, 600)}`,
      isError: true,
    };
  }
}
