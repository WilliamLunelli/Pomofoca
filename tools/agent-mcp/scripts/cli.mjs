// Exercita os provedores via CLI (claude -p / gemini -p) com um CLI SIMULADO (scripts/fake-cli.mjs):
// argumentos de permissão por papel, prompt por stdin, parse de tokens, política de escrita
// pós-execução e ambiente sem chaves de API. Não usa rede nem gasta assinatura.
// Uso: npm run build && node scripts/cli.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = (f) => pathToFileURL(path.join(here, '..', 'dist', f)).href;

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-mcp-cli-'));
const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' }).toString();
fs.mkdirSync(path.join(repo, 'src'));
fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'fx', scripts: {} }));
fs.writeFileSync(path.join(repo, 'src', 'base.ts'), 'export const base = 1;\n');
fs.writeFileSync(path.join(repo, 'CLAUDE.md'), '# regras\n');
git('init', '-q', '-b', 'main');
git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');

const fake = path.join(here, 'fake-cli.mjs');
const log = path.join(repo, '..', `fake-cli-${process.pid}.json`);
Object.assign(process.env, {
  AGENT_REPO_ROOT: repo,
  AGENT_PROVIDER_MODE: 'cli',
  AGENT_CLAUDE_BIN: fake,
  AGENT_GEMINI_BIN: fake,
  FAKE_CLI_LOG: log,
  // Simula a sessão do Claude Code (gestor) com chave de API exportada: nada disso pode vazar.
  ANTHROPIC_API_KEY: 'sk-nao-pode-vazar',
  GEMINI_API_KEY: 'g-nao-pode-vazar',
  CLAUDECODE: '1',
});

const { delegate } = await import(dist('delegate.js'));
const { openTask, closeTask } = await import(dist('workspace.js'));
const { entries } = await import(dist('ledger.js'));
const { lastJson } = await import(dist('cli-runner.js'));

let n = 0;
const ok = (name) => console.log(`OK   ${name}`) || n++;
const read = (...p) => fs.readFileSync(path.join(...p), 'utf8').replace(/\r\n/g, '\n'); // autocrlf no Windows
const lastCall = () => JSON.parse(fs.readFileSync(log, 'utf8'));
const run = (args, writes = {}, mode = 'ok') => {
  process.env.FAKE_CLI_WRITES = JSON.stringify(writes);
  process.env.FAKE_CLI_MODE = mode;
  return delegate(args);
};

await openTask('cli-x');
const wt = path.join(repo, '.agent-worktrees', 'cli-x');

// ---- 1) programador via claude-cli: escreve código + (indevidamente) teste e CLAUDE.md
let r = await run(
  { role: 'programador', taskId: 'cli-x', instruction: 'Crie src/feature.ts' },
  {
    'src/feature.ts': "export const feature = 'ok';\n",
    'src/feature.test.ts': 'teste indevido',
    'CLAUDE.md': 'sobrescrito!',
  },
);
assert.equal(r.isError, false, r.text);
assert.match(r.text, /^\[programador · claude-cli:sonnet · 3 passo\(s\) · 1050 tokens\]/);
assert.match(r.text, /RESUMO: feito pelo CLI simulado/);
ok('programador → claude-cli:sonnet; relatório + tokens (incl. cache) parseados do JSON');

let c = lastCall();
assert.equal(c.kind, 'claude');
assert.equal(path.resolve(c.cwd), path.resolve(wt));
for (const flag of ['-p', '--strict-mcp-config', '--no-session-persistence']) assert.ok(c.argv.includes(flag), flag);
assert.equal(c.argv[c.argv.indexOf('--model') + 1], 'sonnet');
const allowed = c.argv[c.argv.indexOf('--allowedTools') + 1];
const denied = c.argv[c.argv.indexOf('--disallowedTools') + 1];
assert.match(allowed, /Edit/);
assert.match(allowed, /Bash\(npm run test:\*\)/);
assert.match(denied, /WebFetch/);
assert.match(denied, /Read\(\*\*\/\.env\*\)/);
assert.match(c.stdin, /# Tarefa\nCrie src\/feature\.ts/);
assert.match(c.system, /PAPEL: Programador/);
ok('claude-cli: roda no worktree, sem MCP, ferramentas por papel, prompt via stdin, system via arquivo');

assert.equal(c.env.ANTHROPIC_API_KEY, null);
assert.equal(c.env.GEMINI_API_KEY, null);
assert.equal(c.env.CLAUDECODE, null);
ok('ambiente do CLI sem chaves de API (usa o login da assinatura) e sem variáveis da sessão gestora');

assert.equal(read(wt, 'src', 'feature.ts'), "export const feature = 'ok';\n");
assert.ok(!fs.existsSync(path.join(wt, 'src', 'feature.test.ts')), 'teste criado pelo programador deveria ser removido');
assert.equal(read(wt, 'CLAUDE.md'), '# regras\n');
assert.match(r.text, /POLÍTICA: 2 arquivo\(s\).*desfeitos/);
assert.match(r.text, /src\/feature\.ts/);
assert.doesNotMatch(git('show', '--stat', '--format=', 'agent/cli-x'), /feature\.test\.ts|CLAUDE\.md/);
ok('política pós-execução: teste e CLAUDE.md desfeitos; só o código permitido é commitado');

// ---- 2) testador via gemini-cli: escreve teste + (indevidamente) altera produção
r = await run(
  { role: 'testador', taskId: 'cli-x', instruction: 'Teste feature' },
  { 'src/feature.test.ts': 'test("x", () => {});\n', 'src/feature.ts': 'hackeado' },
);
assert.equal(r.isError, false, r.text);
assert.match(r.text, /^\[testador · gemini-cli:pro · 4 passo\(s\) · 2100 tokens\]/);
c = lastCall();
assert.equal(c.kind, 'gemini');
assert.equal(c.argv[c.argv.indexOf('--approval-mode') + 1], 'auto_edit');
assert.equal(c.argv[c.argv.indexOf('--allowed-mcp-server-names') + 1], '__nenhum__');
assert.ok(c.argv.includes('run_shell_command(npm run test)'));
assert.match(c.stdin, /# Instruções do seu papel\n[\s\S]*PAPEL: Testador[\s\S]*# Tarefa\nTeste feature/);
assert.ok(fs.existsSync(path.join(wt, 'src', 'feature.test.ts')));
assert.equal(read(wt, 'src', 'feature.ts'), "export const feature = 'ok';\n");
ok('testador → gemini-cli:pro (auto_edit, shell só npm test/lint, sem MCP); produção alterada é desfeita');

// ---- 3) revisor via gemini-cli: somente leitura, recebe o diff
r = await run({ role: 'revisor', taskId: 'cli-x', instruction: 'Revise' }, { 'src/evil.ts': 'x' });
assert.equal(r.isError, false, r.text);
c = lastCall();
assert.equal(c.argv[c.argv.indexOf('--approval-mode') + 1], 'plan');
assert.ok(!c.argv.includes('--allowed-tools'));
assert.match(c.stdin, /diff --git a\/src\/feature\.ts/);
assert.ok(!fs.existsSync(path.join(wt, 'src', 'evil.ts')));
assert.doesNotMatch(r.text, /Mudanças vs base/);
ok('revisor → gemini-cli em modo plan (só leitura) com o diff no prompt; escrita indevida desfeita');

// ---- 4) explorador sem tarefa: roda na raiz; se escrever algo, só avisa (não reverte sua branch)
r = await run({ role: 'explorador', instruction: 'mapa' }, { 'NOTAS.md': 'oops' });
assert.equal(r.isError, false, r.text);
assert.equal(path.resolve(lastCall().cwd), path.resolve(repo));
assert.match(r.text, /ATENÇÃO: o worker alterou arquivos na raiz do repo: NOTAS\.md/);
fs.rmSync(path.join(repo, 'NOTAS.md'));
ok('explorador sem taskId roda na raiz e avisa (sem reverter) se algo foi alterado');

// ---- 5) erros: login ausente e saída sem JSON
r = await run({ role: 'seguranca', taskId: 'cli-x', instruction: 'audite' }, {}, 'auth-error');
assert.equal(r.isError, true);
assert.match(r.text, /Falha ao delegar para seguranca \(claude-cli:sonnet\)/);
assert.match(r.text, /faça login com a conta Claude Pro/);
r = await run({ role: 'triagem', taskId: 'cli-x', instruction: 'classifique' }, {}, 'auth-error');
assert.match(r.text, /Login with Google/);
r = await run({ role: 'documentacao', taskId: 'cli-x', instruction: 'doc' }, {}, 'garbage');
assert.equal(r.isError, true);
assert.match(r.text, /saiu com código 1 sem JSON[\s\S]*something exploded/);
assert.equal(entries('cli-x').at(-1).ok, false);
ok('erros do CLI: dica de login por provedor; saída sem JSON vira erro curto + ledger ok=false');

// ---- 6) parse tolerante
assert.deepEqual(lastJson('warn {x}\n{"a":1}'), { a: 1 });
assert.equal(lastJson('nada aqui'), undefined);
ok('lastJson ignora ruído antes do JSON');

// ---- 7) override por papel
process.env.AGENT_MODEL_REVISOR = 'claude-cli:opus';
r = await run({ role: 'revisor', taskId: 'cli-x', instruction: 'Revise' });
assert.match(r.text, /^\[revisor · claude-cli:opus/);
delete process.env.AGENT_MODEL_REVISOR;
ok('AGENT_MODEL_<PAPEL>=claude-cli:opus troca o worker sem editar código');

await closeTask('cli-x');
fs.rmSync(log, { force: true });
console.log(`\nCLI OK (${n} grupos)`);
