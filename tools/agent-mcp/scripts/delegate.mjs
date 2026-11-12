// Exercita o laço REAL do worker (generateText + ferramentas + commit + ledger + orçamento)
// com um modelo simulado — sem chaves de API e sem gastar tokens.
// Uso: npm run build && node scripts/delegate.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { MockLanguageModelV4 } from 'ai/test';

const here = path.dirname(fileURLToPath(import.meta.url));
// import() exige URL file:// para caminho absoluto - um path.join() puro falha no
// Windows com ERR_UNSUPPORTED_ESM_URL_SCHEME (a letra da unidade, "C:", é lida como
// um scheme de URL desconhecido).
const dist = (f) => pathToFileURL(path.join(here, '..', 'dist', f)).href;

const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-mcp-delegate-'));
const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' }).toString();
fs.mkdirSync(path.join(repo, 'src'));
fs.writeFileSync(path.join(repo, 'package.json'), JSON.stringify({ name: 'fx', scripts: {} }));
fs.writeFileSync(path.join(repo, 'src', 'base.ts'), 'export const base = 1;\n');
fs.writeFileSync(path.join(repo, 'CONVENTIONS.md'), '# Convenção X: use aspas simples\n');
git('init', '-q', '-b', 'main');
git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A');
git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init');

process.env.AGENT_REPO_ROOT = repo;
// Este teste cobre o caminho via AI SDK (modelo simulado); o caminho via CLI está em scripts/cli.mjs.
process.env.AGENT_PROVIDER_MODE = 'api';
process.env.AGENT_MAX_DELEGATIONS_PER_TASK = '4';
const { delegate } = await import(dist('delegate.js'));
const { openTask, closeTask } = await import(dist('workspace.js'));
const { entries } = await import(dist('ledger.js'));

const usage = (i, o) => ({
  inputTokens: { total: i, noCache: i, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: o, text: o, reasoning: 0 },
});
const finish = (unified) => ({ unified, raw: unified });

let n = 0;
const ok = (name) => console.log(`OK   ${name}`) || n++;
const promptText = (options) => JSON.stringify(options.prompt);

await openTask('feat-x');

// ---- 1) programador: chama writeFile (passo 1) e depois devolve o relatório (passo 2)
let call = 0;
let systemSeen = '';
const programmerModel = new MockLanguageModelV4({
  doGenerate: async (options) => {
    call++;
    if (call === 1) {
      systemSeen = promptText(options);
      return {
        content: [
          {
            type: 'tool-call',
            toolCallId: 'c1',
            toolName: 'writeFile',
            input: JSON.stringify({ path: 'src/feature.ts', content: "export const feature = 'ok';\n" }),
          },
        ],
        finishReason: finish('tool-calls'),
        usage: usage(1000, 50),
        warnings: [],
      };
    }
    return {
      content: [{ type: 'text', text: 'RESUMO: criei feature.ts\nARQUIVOS: src/feature.ts\nPENDÊNCIAS/RISCOS: nenhuma' }],
      finishReason: finish('stop'),
      usage: usage(1200, 40),
      warnings: [],
    };
  },
});

let r = await delegate({
  role: 'programador',
  taskId: 'feat-x',
  instruction: 'Crie src/feature.ts',
  modelResolver: () => programmerModel,
});
assert.equal(r.isError, false, r.text);
assert.match(r.text, /^\[programador · anthropic:/);
assert.match(r.text, /2 passo\(s\) · 2290 tokens/);
assert.match(r.text, /RESUMO: criei feature\.ts/);
assert.match(r.text, /src\/feature\.ts/); // diffstat
ok('programador: tool-call executado, relatório curto + diffstat, tokens somados (1000+50+1200+40)');

assert.match(systemSeen, /Convenção X/);
ok('CONVENTIONS.md do projeto entra no prompt de sistema do worker');

const wt = path.join(path.dirname(repo), `${path.basename(repo)}-agent-worktrees`, 'feat-x');
assert.equal(fs.readFileSync(path.join(wt, 'src', 'feature.ts'), 'utf8'), "export const feature = 'ok';\n");
assert.ok(!fs.existsSync(path.join(repo, 'src', 'feature.ts')), 'repo principal não pode ser tocado');
assert.match(git('log', '--format=%s', 'agent/feat-x'), /agent\(programador\): Crie src\/feature\.ts/);
ok('arquivo escrito só no worktree; commit de checkpoint criado na branch agent/feat-x');

let led = entries('feat-x');
assert.equal(led.length, 1);
assert.equal(led[0].inputTokens, 2200);
assert.equal(led[0].outputTokens, 90);
assert.equal(led[0].ok, true);
ok('ledger registra tokens de entrada/saída (totalUsage) por delegação');

// ---- 2) revisor: recebe o diff no prompt e não escreve nada
let reviewerPrompt = '';
const reviewerModel = new MockLanguageModelV4({
  doGenerate: async (options) => {
    reviewerPrompt = promptText(options);
    return {
      content: [{ type: 'text', text: 'BLOQUEANTES: nenhum\nIMPORTANTES: nenhum\nMENORES: nenhum' }],
      finishReason: finish('stop'),
      usage: usage(500, 20),
      warnings: [],
    };
  },
});
r = await delegate({ role: 'revisor', taskId: 'feat-x', instruction: 'Revise', modelResolver: () => reviewerModel });
assert.equal(r.isError, false, r.text);
assert.match(reviewerPrompt, /diff --git a\/src\/feature\.ts/);
assert.match(reviewerPrompt, /feature = 'ok'/);
assert.doesNotMatch(r.text, /Mudanças vs base/);
ok('revisor: diff completo vai no prompt do revisor; nada volta ao gestor além do relatório');

// ---- 3) papel que exige tarefa, sem taskId
r = await delegate({ role: 'programador', instruction: 'x', modelResolver: () => programmerModel });
assert.equal(r.isError, true);
assert.match(r.text, /exige taskId/);
ok('papel de escrita sem taskId é recusado');

// ---- 4) worker que tenta escrever teste como programador: ferramenta nega, laço continua
call = 0;
const sneaky = new MockLanguageModelV4({
  doGenerate: async () => {
    call++;
    if (call === 1) {
      return {
        content: [
          { type: 'tool-call', toolCallId: 'c2', toolName: 'writeFile', input: JSON.stringify({ path: 'src/x.test.ts', content: 'x' }) },
        ],
        finishReason: finish('tool-calls'),
        usage: usage(100, 10),
        warnings: [],
      };
    }
    return { content: [{ type: 'text', text: 'RESUMO: não consegui' }], finishReason: finish('stop'), usage: usage(100, 10), warnings: [] };
  },
});
r = await delegate({ role: 'programador', taskId: 'feat-x', instruction: 'Escreva teste', modelResolver: () => sneaky });
assert.equal(r.isError, false, r.text);
assert.ok(!fs.existsSync(path.join(wt, 'src', 'x.test.ts')));
assert.match(r.text, /este worker não alterou arquivos/);
ok('programador não consegue criar arquivo de teste (negado pela ferramenta)');

// ---- 5) orçamento: limite de 4 delegações por tarefa
r = await delegate({ role: 'revisor', taskId: 'feat-x', instruction: 'Revise de novo', modelResolver: () => reviewerModel });
assert.equal(r.isError, false);
r = await delegate({ role: 'revisor', taskId: 'feat-x', instruction: 'Revise de novo', modelResolver: () => reviewerModel });
assert.equal(r.isError, true);
assert.match(r.text, /Limite de 4 delegações/);
ok('orçamento: a 5ª delegação da tarefa é bloqueada com instrução de parar e reportar');

// ---- 6) falha do modelo vira erro limpo e é registrada
const broken = new MockLanguageModelV4({
  doGenerate: async () => {
    throw new Error('boom 503');
  },
});
r = await delegate({ role: 'explorador', instruction: 'mapa', modelResolver: () => broken });
assert.equal(r.isError, true);
assert.match(r.text, /Falha ao delegar para explorador/);
assert.equal(entries('_sem-tarefa').at(-1).ok, false);
ok('erro do provedor: mensagem curta ao gestor + registro ok=false no ledger');

await closeTask('feat-x');
fs.rmSync(repo, { recursive: true, force: true });
console.log(`\nDelegate OK (${n} grupos)`);
