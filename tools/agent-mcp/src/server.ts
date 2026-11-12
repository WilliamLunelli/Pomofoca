#!/usr/bin/env node
/**
 * Servidor MCP (stdio). O gestor (Opus no Claude Code) enxerga só estas ferramentas;
 * por trás de cada uma há um modelo/provedor diferente, definido em config.ts.
 *
 * ATENÇÃO: em stdio, stdout é o canal do protocolo. Logue SEMPRE em stderr (console.error).
 */
import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { clip, diffStat, tail } from './compress.js';
import { GATE_CHECKS } from './config.js';
import { delegate } from './delegate.js';
import { checkDocs } from './docs-check.js';
import { logPath, runGate } from './gate.js';
import { report } from './ledger.js';
import { closeTask, openTask, requireTask } from './workspace.js';

const server = new McpServer(
  { name: 'pomofoca-agents', version: '0.1.0' },
  {
    instructions:
      'Ferramentas para delegar trabalho a subagentes. Fluxo: tarefa_abrir → explorar (opcional) → codar → testar → gate → (triar_falhas se falhar) → revisar → auditar_seguranca → documentar → tarefa_encerrar. ' +
      'Passe instruções completas e autocontidas (objetivo, arquivos relevantes, critério de aceitação). Os relatórios voltam resumidos; o código fica commitado na branch agent/<taskId>.',
  },
);

type ToolReply = { content: { type: 'text'; text: string }[]; isError?: boolean };
const reply = (text: string, isError = false): ToolReply => ({
  content: [{ type: 'text', text }],
  ...(isError ? { isError: true } : {}),
});
const guarded = async (fn: () => Promise<ToolReply>): Promise<ToolReply> => {
  try {
    return await fn();
  } catch (e) {
    return reply(e instanceof Error ? e.message : String(e), true);
  }
};
const fromDelegate = async (args: Parameters<typeof delegate>[0]): Promise<ToolReply> => {
  const r = await delegate(args);
  return reply(r.text, r.isError);
};

const taskId = z
  .string()
  .describe(
    'Identificador da tarefa (minúsculas, números e hífens), ex.: "relatorio-mensal"',
  );

server.registerTool(
  'tarefa_abrir',
  {
    title: 'Abrir tarefa',
    description:
      'Cria um worktree git isolado e a branch agent/<taskId> a partir de `base` (padrão: HEAD). Todos os workers da tarefa trabalham ali, sem tocar na sua branch atual.',
    inputSchema: {
      taskId,
      base: z.string().optional().describe('Branch/commit de partida (padrão: HEAD)'),
    },
  },
  ({ taskId: id, base }) =>
    guarded(async () => {
      const { meta, reused } = await openTask(id, base);
      return reply(
        `${reused ? 'Tarefa já estava aberta' : 'Tarefa aberta'}: branch ${meta.branch}, base ${meta.base.slice(0, 8)}, worktree em ${meta.dir}`,
      );
    }),
);

server.registerTool(
  'explorar',
  {
    title: 'Mapear o código',
    description:
      'Explorador (modelo barato, contexto grande): lê o código e devolve um mapa enxuto — arquivos relevantes, convenções e riscos — para você planejar sem gastar tokens lendo o repositório. taskId é opcional (sem ele, lê a raiz do repositório).',
    inputSchema: {
      objetivo: z
        .string()
        .describe('O que você pretende fazer e que informações precisa do código'),
      taskId: taskId.optional(),
    },
  },
  ({ objetivo, taskId: id }) =>
    fromDelegate({ role: 'explorador', taskId: id, instruction: objetivo }),
);

server.registerTool(
  'codar',
  {
    title: 'Delegar implementação',
    description:
      'Programador (Sonnet): implementa a mudança no worktree da tarefa e roda typecheck/lint. Não altera testes. Passe objetivo, arquivos relevantes, restrições e critério de aceitação. Retorna relatório curto + diffstat; o código fica commitado.',
    inputSchema: {
      taskId,
      instrucao: z.string().describe('Instrução completa e autocontida'),
    },
  },
  ({ taskId: id, instrucao }) =>
    fromDelegate({ role: 'programador', taskId: id, instruction: instrucao }),
);

server.registerTool(
  'testar',
  {
    title: 'Delegar testes',
    description:
      'Testador (Gemini): escreve testes (só arquivos de teste) para o comportamento descrito e os executa. Se o teste revelar bug no código de produção, ele deixa falhando e relata. Passe o comportamento esperado, não a implementação.',
    inputSchema: {
      taskId,
      instrucao: z.string().describe('Comportamento a ser testado e arquivos envolvidos'),
    },
  },
  ({ taskId: id, instrucao }) =>
    fromDelegate({ role: 'testador', taskId: id, instruction: instrucao }),
);

server.registerTool(
  'revisar',
  {
    title: 'Revisão de código',
    description:
      'Revisor (modelo diferente do programador): analisa o diff completo da tarefa e devolve bloqueantes/importantes/menores, em lista curta.',
    inputSchema: {
      taskId,
      foco: z.string().optional().describe('Aspecto a priorizar, se houver'),
    },
  },
  ({ taskId: id, foco }) =>
    fromDelegate({
      role: 'revisor',
      taskId: id,
      instruction: `Revise o diff desta tarefa.${foco ? ` Foco: ${foco}` : ''}`,
    }),
);

server.registerTool(
  'auditar_seguranca',
  {
    title: 'Revisão de segurança',
    description:
      'Revisor de segurança: procura injeção, falhas de auth/autorização, segredos, validação ausente e problemas de pagamento/webhook no diff da tarefa. Rode antes de integrar mudanças em rotas, auth ou pagamentos.',
    inputSchema: { taskId },
  },
  ({ taskId: id }) =>
    fromDelegate({
      role: 'seguranca',
      taskId: id,
      instruction: 'Faça a revisão de segurança do diff desta tarefa.',
    }),
);

server.registerTool(
  'documentar',
  {
    title: 'Atualizar documentação',
    description:
      'Documentação (modelo barato): atualiza README/docs/CHANGELOG a partir do diff da tarefa. Só mexe em arquivos .md e docs/.',
    inputSchema: {
      taskId,
      instrucao: z.string().optional().describe('Orientação extra (opcional)'),
      forcar: z
        .boolean()
        .optional()
        .describe(
          'Chama o worker mesmo se nenhum .md permitido citar os arquivos alterados (padrão: não)',
        ),
    },
  },
  ({ taskId: id, instrucao, forcar }) =>
    guarded(async () => {
      const meta = requireTask(id);
      if (!forcar) {
        // Sem LLM: se nenhum doc editável cita o que mudou, não há o que o worker fazer.
        const docs = await checkDocs(meta.dir, meta.base);
        if (!docs.editable.length) {
          const prot = docs.protectedHits.length
            ? ` Docs PROTEGIDOS que citam esses arquivos (o dono do projeto ajusta): ${docs.protectedHits.join(', ')}.`
            : '';
          return reply(
            `Documentação pulada sem LLM: nenhum .md/docs editável cita os ${docs.changed.length} arquivo(s) alterados.${prot} Use forcar=true para chamar o worker mesmo assim.`,
          );
        }
      }
      return fromDelegate({
        role: 'documentacao',
        taskId: id,
        instruction:
          instrucao ?? 'Atualize a documentação afetada pelo diff desta tarefa.',
      });
    }),
);

server.registerTool(
  'gate',
  {
    title: 'Gate determinístico',
    description: `Roda typecheck/lint/testes SEM LLM no worktree da tarefa. Checks: ${GATE_CHECKS.map((c) => c.name).join(', ')}. Retorna só o resumo das falhas. Rode antes de revisar e depois de cada correção.`,
    inputSchema: {
      taskId,
      checks: z
        .array(z.string())
        .optional()
        .describe('Subconjunto de checks (padrão: todos)'),
    },
  },
  ({ taskId: id, checks }) =>
    guarded(async () => {
      const meta = requireTask(id);
      return reply(await runGate(id, meta.dir, checks));
    }),
);

server.registerTool(
  'triar_falhas',
  {
    title: 'Triagem de falha',
    description:
      'Lê o log do último gate que falhou e classifica a causa (bug_codigo | teste_ruim | ambiente | incerto), indicando quem deve corrigir. Evita que você gaste contexto com stack traces.',
    inputSchema: {
      taskId,
      check: z.string().describe('Nome do check que falhou, ex.: "test"'),
    },
  },
  ({ taskId: id, check }) =>
    guarded(async () => {
      const meta = requireTask(id);
      if (!GATE_CHECKS.some((c) => c.name === check)) {
        return reply(
          `Check desconhecido. Disponíveis: ${GATE_CHECKS.map((c) => c.name).join(', ')}`,
          true,
        );
      }
      let log: string;
      try {
        log = fs.readFileSync(logPath(id, check), 'utf8');
      } catch {
        return reply(`Sem log para o check "${check}". Rode o gate antes.`, true);
      }
      return fromDelegate({
        role: 'triagem',
        taskId: id,
        instruction: `Classifique a falha do check "${check}".`,
        extra: `## Log (final)\n${clip(tail(log, 200), 12_000)}\n\n## Diffstat da tarefa\n${await diffStat(meta.dir, meta.base)}`,
      });
    }),
);

server.registerTool(
  'tarefa_encerrar',
  {
    title: 'Encerrar tarefa',
    description:
      'Remove o worktree da tarefa, MANTENDO a branch agent/<taskId> para você fazer o merge/PR. Nunca apaga a branch.',
    inputSchema: { taskId },
  },
  ({ taskId: id }) =>
    guarded(async () => {
      const meta = await closeTask(id);
      return reply(
        `Worktree removido. A branch ${meta.branch} foi mantida (merge: git merge ${meta.branch}).`,
      );
    }),
);

server.registerTool(
  'custos',
  {
    title: 'Uso de tokens',
    description:
      'Mostra tokens e tempo por papel/modelo, de uma tarefa ou de todas. Use para achar qual agente está custando mais.',
    inputSchema: { taskId: taskId.optional() },
  },
  ({ taskId: id }) => guarded(async () => reply(report(id))),
);

await server.connect(new StdioServerTransport());
console.error('[pomofoca-agents] servidor MCP pronto (stdio).');
