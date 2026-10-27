/**
 * Ferramentas que os WORKERS (Sonnet, Gemini…) usam dentro do worktree da tarefa.
 * Permissão mínima por papel: o explorador só lê; o testador só escreve arquivos de teste;
 * o programador escreve código mas não mexe em testes; ninguém toca em segredos, .git ou no próprio MCP.
 */
import fs from 'node:fs';
import path from 'node:path';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { GATE_CHECKS } from './config.js';
import { formatResults, runCheck } from './gate.js';
import { clip } from './compress.js';
import { assertReadable, isProtectedPath, run } from './workspace.js';

export interface ToolPolicy {
  canWrite?: (relPath: string) => boolean;
  canRunChecks?: boolean;
}

const MAX_WRITE_BYTES = 200_000;

export function buildTools(taskId: string, root: string, policy: ToolPolicy): ToolSet {
  const rel = (p: string) => path.relative(root, assertReadable(root, p));

  const tools: ToolSet = {
    listDir: tool({
      description:
        'Lista arquivos e pastas de um diretório (relativo à raiz do projeto). Pastas terminam com "/".',
      inputSchema: z.object({ path: z.string().default('.') }),
      execute: async ({ path: p }) => {
        const abs = assertReadable(root, p);
        const items = fs
          .readdirSync(abs, { withFileTypes: true })
          .filter(
            (d) =>
              d.name !== 'node_modules' &&
              d.name !== '.git' &&
              !d.name.startsWith('.env'),
          )
          .map((d) => (d.isDirectory() ? `${d.name}/` : d.name))
          .sort();
        return clip(items.slice(0, 300).join('\n') || '(vazio)', 8000);
      },
    }),

    readFile: tool({
      description:
        'Lê um arquivo de texto com números de linha. Use startLine/endLine para arquivos grandes (padrão: 400 linhas).',
      inputSchema: z.object({
        path: z.string(),
        startLine: z.number().int().min(1).optional(),
        endLine: z.number().int().min(1).optional(),
      }),
      execute: async ({ path: p, startLine, endLine }) => {
        const abs = assertReadable(root, p);
        const lines = fs.readFileSync(abs, 'utf8').split('\n');
        const start = startLine ?? 1;
        const end = Math.min(endLine ?? start + 399, lines.length);
        const body = lines
          .slice(start - 1, end)
          .map((l, i) => `${start + i}\t${l}`)
          .join('\n');
        return clip(
          `${rel(p)} (${lines.length} linhas, mostrando ${start}-${end})\n${body}`,
          40_000,
        );
      },
    }),

    searchText: tool({
      description:
        'Busca por regex (estendida) nos arquivos do projeto, incluindo novos ainda não commitados. Retorna até 80 linhas.',
      inputSchema: z.object({
        pattern: z.string().min(1),
        path: z.string().default('.'),
      }),
      execute: async ({ pattern, path: p }) => {
        assertReadable(root, p);
        const r = await run(
          'git',
          [
            'grep',
            '--untracked',
            '-n',
            '-I',
            '-E',
            '--max-count=20',
            '-e',
            pattern,
            '--',
            p,
          ],
          { cwd: root },
        );
        if (r.code === 1 && !r.stdout) return 'Nenhuma ocorrência.';
        const lines = r.stdout
          .split('\n')
          .filter(Boolean)
          .slice(0, 80)
          .map((l) => clip(l, 300));
        return lines.join('\n') || clip(r.stderr, 500);
      },
    }),
  };

  if (policy.canWrite) {
    const canWrite = policy.canWrite;
    const assertWritable = (p: string): string => {
      const abs = assertReadable(root, p);
      const r = path.relative(root, abs);
      if (isProtectedPath(r)) throw new Error(`Arquivo protegido: ${r}`);
      if (!canWrite(r)) throw new Error(`Seu papel não pode alterar "${r}".`);
      return abs;
    };

    tools.writeFile = tool({
      description:
        'Cria ou sobrescreve um arquivo (cria pastas se necessário). Para mudanças pequenas em arquivo existente prefira replaceInFile.',
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async ({ path: p, content }) => {
        const abs = assertWritable(p);
        if (Buffer.byteLength(content) > MAX_WRITE_BYTES)
          throw new Error('Conteúdo grande demais (>200KB).');
        fs.mkdirSync(path.dirname(abs), { recursive: true });
        fs.writeFileSync(abs, content);
        return `Escrito: ${path.relative(root, abs)} (${content.split('\n').length} linhas)`;
      },
    });

    tools.replaceInFile = tool({
      description:
        'Substitui um trecho EXATO (deve ocorrer exatamente uma vez) por outro num arquivo existente.',
      inputSchema: z.object({
        path: z.string(),
        oldString: z.string().min(1),
        newString: z.string(),
      }),
      execute: async ({ path: p, oldString, newString }) => {
        const abs = assertWritable(p);
        const text = fs.readFileSync(abs, 'utf8');
        const count = text.split(oldString).length - 1;
        if (count !== 1)
          throw new Error(
            `oldString ocorre ${count}x (precisa ser exatamente 1). Inclua mais contexto.`,
          );
        fs.writeFileSync(
          abs,
          text.replace(oldString, () => newString),
        );
        return `Editado: ${path.relative(root, abs)}`;
      },
    });
  }

  if (policy.canRunChecks) {
    tools.runCheck = tool({
      description: `Roda um check do projeto no worktree e devolve o resultado resumido. Checks: ${GATE_CHECKS.map((c) => c.name).join(', ')}. Para "test" você pode passar testPath para rodar só um arquivo.`,
      inputSchema: z.object({ check: z.string(), testPath: z.string().optional() }),
      execute: async ({ check, testPath }) => {
        const c = GATE_CHECKS.find((x) => x.name === check);
        if (!c)
          return `Check desconhecido. Disponíveis: ${GATE_CHECKS.map((x) => x.name).join(', ')}`;
        const extra: string[] = [];
        if (testPath) {
          if (testPath.startsWith('-')) throw new Error('testPath inválido.');
          extra.push(rel(testPath));
        }
        return formatResults([await runCheck(taskId, root, c, extra)]);
      },
    });
  }

  return tools;
}
