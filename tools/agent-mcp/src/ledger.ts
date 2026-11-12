/**
 * Registro de cada delegação (quem, qual modelo, quantos tokens, quanto tempo)
 * + checagem de orçamento por tarefa. Sem isso você não descobre qual agente queima dinheiro.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MAX_DELEGATIONS_PER_TASK, MAX_TOKENS_PER_TASK } from './config.js';
import { logsDir } from './workspace.js';

export interface LedgerEntry {
  ts: string;
  taskId: string;
  role: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  ok: boolean;
  note?: string;
  /** Identificador da delegação (liga ledger, "em andamento" e transcrições). */
  id?: string;
  /** O que o gestor mandou (cortado) — para o painel mostrar a passagem de bastão. */
  instruction?: string;
  /** O que voltou ao gestor (cortado). */
  report?: string;
  /** Transcrições do CLI (relativas a .agent-logs/), quando houver. */
  transcripts?: string[];
}

/** Delegação em execução agora (arquivo some quando termina). Lido pelo painel. */
export interface RunningEntry {
  id: string;
  startedAt: string;
  taskId: string;
  role: string;
  model: string;
  instruction: string;
  /** Prefixo da transcrição ao vivo (relativo a .agent-logs/), se o CLI gravar. */
  transcriptBase?: string;
}

const file = () => path.join(logsDir(), 'delegations.jsonl');
const runningDir = () => path.join(logsDir(), 'running');

export function markRunning(entry: RunningEntry): void {
  fs.mkdirSync(runningDir(), { recursive: true });
  fs.writeFileSync(path.join(runningDir(), `${entry.id}.json`), JSON.stringify(entry));
}

export function clearRunning(id: string): void {
  fs.rmSync(path.join(runningDir(), `${id}.json`), { force: true });
}

/**
 * Relatório que voltou ao gestor, ligado à delegação pelo id. Fica num arquivo próprio
 * (reports.jsonl) para não misturar linhas sem tokens no ledger usado pelo orçamento.
 */
export function attachReport(id: string, report: string): void {
  fs.mkdirSync(logsDir(), { recursive: true });
  fs.appendFileSync(
    path.join(logsDir(), 'reports.jsonl'),
    JSON.stringify({ id, report: report.slice(0, 8000) }) + '\n',
  );
}

/** Resultado de cada gate (sem LLM), para o painel. */
export function recordGate(
  taskId: string,
  results: { name: string; status: string; ms: number }[],
): void {
  fs.mkdirSync(logsDir(), { recursive: true });
  fs.appendFileSync(
    path.join(logsDir(), 'gates.jsonl'),
    JSON.stringify({ ts: new Date().toISOString(), taskId, results }) + '\n',
  );
}

export function record(entry: LedgerEntry): void {
  fs.mkdirSync(logsDir(), { recursive: true });
  fs.appendFileSync(file(), JSON.stringify(entry) + '\n');
}

export function entries(taskId?: string): LedgerEntry[] {
  try {
    return fs
      .readFileSync(file(), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LedgerEntry)
      .filter((e) => !taskId || e.taskId === taskId);
  } catch {
    return [];
  }
}

/** Retorna uma mensagem de bloqueio se o orçamento da tarefa acabou; senão, null. */
/**
 * Limite de tokens da tarefa. `.agent-logs/budgets.json` ({ "<taskId>": <tokens> }) permite ao
 * USUÁRIO liberar mais orçamento para uma tarefa específica sem mudar o padrão das outras e sem
 * reiniciar o servidor. Os workers não escrevem em .agent-logs/ (caminho negado a todos).
 */
export function tokenLimitFor(taskId: string): number {
  try {
    const budgets = JSON.parse(
      fs.readFileSync(path.join(logsDir(), 'budgets.json'), 'utf8'),
    ) as Record<string, unknown>;
    const v = Number(budgets[taskId]);
    if (Number.isFinite(v) && v > 0) return v;
  } catch {
    /* sem arquivo ou inválido: usa o padrão */
  }
  return MAX_TOKENS_PER_TASK;
}

export function budgetBlock(taskId: string): string | null {
  const list = entries(taskId);
  const tokens = list.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0);
  const limit = tokenLimitFor(taskId);
  if (tokens >= limit) {
    return `Orçamento da tarefa estourado (${tokens} de ${limit} tokens). Pare, resuma o estado atual ao usuário e peça decisão.`;
  }
  if (list.length >= MAX_DELEGATIONS_PER_TASK) {
    return `Limite de ${MAX_DELEGATIONS_PER_TASK} delegações por tarefa atingido. Pare, resuma o estado atual ao usuário e peça decisão.`;
  }
  return null;
}

export function report(taskId?: string): string {
  const list = entries(taskId);
  if (list.length === 0) return 'Nenhuma delegação registrada ainda.';
  const byRole = new Map<
    string,
    { calls: number; inTok: number; outTok: number; ms: number }
  >();
  for (const e of list) {
    const key = `${e.role} (${e.model})`;
    const cur = byRole.get(key) ?? { calls: 0, inTok: 0, outTok: 0, ms: 0 };
    cur.calls += 1;
    cur.inTok += e.inputTokens;
    cur.outTok += e.outputTokens;
    cur.ms += e.ms;
    byRole.set(key, cur);
  }
  const total = list.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0);
  const lines = [...byRole.entries()].map(
    ([k, v]) =>
      `- ${k}: ${v.calls} chamada(s), ${v.inTok} in / ${v.outTok} out, ${(v.ms / 1000).toFixed(0)}s`,
  );
  return [
    `Tokens totais${taskId ? ` da tarefa ${taskId}` : ''}: ${total} (limite: ${taskId ? tokenLimitFor(taskId) : MAX_TOKENS_PER_TASK})`,
    ...lines,
    'Para custo em dinheiro, multiplique pelos preços atuais de cada modelo (não embutidos aqui de propósito).',
  ].join('\n');
}
