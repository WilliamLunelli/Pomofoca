// Smoke test: sobe o servidor MCP num repositório git descartável e exercita as ferramentas
// que NÃO dependem de LLM (abrir tarefa, gate, custos, encerrar) + o caminho de erro das que dependem.
// Uso: npm run build && npm run smoke
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const serverJs = path.join(here, '..', 'dist', 'server.js');
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-mcp-smoke-'));
const sh = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' });

// --- fixture: espelha o GATE_CHECKS real do Pomofoca (src/config.ts), não o
// default genérico do esqueleto - "lint" na raiz (passa) e "test" dentro de
// apps/api (formato Jest, falha), sem "typecheck" (não existe no monorepo real).
fs.writeFileSync(
  path.join(repo, 'package.json'),
  JSON.stringify(
    {
      name: 'fixture',
      scripts: {
        lint: 'node -e "process.exit(0)"',
      },
    },
    null,
    2,
  ),
);
fs.mkdirSync(path.join(repo, 'apps', 'api'), { recursive: true });
fs.writeFileSync(
  path.join(repo, 'apps', 'api', 'package.json'),
  JSON.stringify(
    {
      name: 'fixture-api',
      scripts: {
        test: 'node -e "console.log(\'  ● soma › soma dois números\\n\\n    expect(received).toBe(expected)\\n    Expected: 4\\n    Received: 5\\n\\nTests:       1 failed, 1 total\'); process.exit(1)"',
      },
    },
    null,
    2,
  ),
);
fs.writeFileSync(path.join(repo, '.gitignore'), '.agent-logs/\n.agent-worktrees/\nnode_modules/\n');
sh('init', '-q', '-b', 'main');
sh('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
sh('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');

// Modo api sem chaves: valida a falha limpa sem acionar os CLIs reais (que gastariam a assinatura).
const env = { ...process.env, AGENT_REPO_ROOT: repo, AGENT_PROVIDER_MODE: 'api' };
delete env.ANTHROPIC_API_KEY;
delete env.GOOGLE_GENERATIVE_AI_API_KEY;
delete env.ANTHROPIC_API_KEY;
delete env.GOOGLE_GENERATIVE_AI_API_KEY;

const client = new Client({ name: 'smoke', version: '0.0.0' });
await client.connect(new StdioClientTransport({ command: 'node', args: [serverJs], cwd: repo, env }));

let failures = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'OK  ' : 'FAIL'} ${name}${cond ? '' : ` — ${extra}`}`);
  if (!cond) failures++;
};
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  return { text: r.content.map((c) => c.text).join('\n'), isError: Boolean(r.isError) };
};

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
check('11 ferramentas expostas', tools.length === 11, names.join(','));

let r = await call('tarefa_abrir', { taskId: 'demo' });
check('tarefa_abrir cria worktree', !r.isError && /agent\/demo/.test(r.text), r.text);
check('worktree existe no disco', fs.existsSync(path.join(repo, '.agent-worktrees', 'demo', 'package.json')));

r = await call('tarefa_abrir', { taskId: 'Nome Inválido' });
check('taskId inválido é recusado', r.isError, r.text);

r = await call('gate', { taskId: 'demo' });
check('gate: lint pass', /lint: pass/.test(r.text), r.text);
check('gate: test fail com resumo do Jest', /test: fail/.test(r.text) && /Expected: 4/.test(r.text), r.text);

r = await call('codar', { taskId: 'demo', instrucao: 'qualquer coisa' });
check('codar sem chave falha de forma limpa', r.isError && /ANTHROPIC_API_KEY/.test(r.text), r.text);

r = await call('codar', { taskId: 'nao-existe', instrucao: 'x' });
check('codar em tarefa não aberta é recusado', r.isError && /tarefa_abrir/.test(r.text), r.text);

r = await call('triar_falhas', { taskId: 'demo', check: 'test' });
check('triar_falhas lê o log e falha limpo sem chave', r.isError && /GOOGLE_GENERATIVE_AI_API_KEY/.test(r.text), r.text);

r = await call('custos', { taskId: 'demo' });
check('custos registra as tentativas', /Tokens totais/.test(r.text) || /Nenhuma/.test(r.text), r.text);

r = await call('tarefa_encerrar', { taskId: 'demo' });
check('tarefa_encerrar remove worktree e mantém branch', !r.isError && !fs.existsSync(path.join(repo, '.agent-worktrees', 'demo')), r.text);
check('branch agent/demo continua existindo', sh('branch', '--list', 'agent/demo').toString().includes('agent/demo'));

await client.close();
fs.rmSync(repo, { recursive: true, force: true });
console.log(failures === 0 ? '\nSmoke OK' : `\n${failures} falha(s)`);
process.exit(failures === 0 ? 0 : 1);
