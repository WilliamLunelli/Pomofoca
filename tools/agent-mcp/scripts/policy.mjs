// Testa as permissões das ferramentas dos workers (sem LLM): quem pode ler/escrever o quê.
// Uso: npm run build && node scripts/policy.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
// import() exige URL file:// para caminho absoluto - um path.join() puro falha no
// Windows com ERR_UNSUPPORTED_ESM_URL_SCHEME (a letra da unidade, "C:", é lida como
// um scheme de URL desconhecido).
const dist = (f) => pathToFileURL(path.join(here, '..', 'dist', f)).href;
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-mcp-policy-'));
process.env.AGENT_REPO_ROOT = root;
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.writeFileSync(path.join(root, 'src', 'a.ts'), 'export const a = 1;\nexport const b = 1;\n');
fs.writeFileSync(path.join(root, '.env'), 'SEGREDO=1');

const { buildTools } = await import(dist('fs-tools.js'));
const { isTestPath, isDocPath, isProtectedPath } = await import(dist('workspace.js'));

const opts = { toolCallId: 't', messages: [] };
const run = (tools, name, input) => tools[name].execute(input, opts);
const denied = async (p, msg) => assert.rejects(Promise.resolve().then(p), undefined, msg);

let n = 0;
const ok = (name) => console.log(`OK   ${name}`) || n++;

// classificadores de caminho
assert.ok(isTestPath('src/a.test.ts') && isTestPath('backend/tests/x.ts') && isTestPath('src/__tests__/y.ts'));
assert.ok(!isTestPath('src/a.ts') && !isTestPath('src/latest.ts'));
assert.ok(isDocPath('README.md') && isDocPath('docs/x.txt') && !isDocPath('src/a.ts'));
assert.ok(isProtectedPath('.mcp.json') && isProtectedPath('tools/agent-mcp/src/x.ts') && isProtectedPath('CLAUDE.md'));
ok('classificadores de caminho');

// usa a política REAL de cada papel (a mesma do delegate.ts)
const { policyFor } = await import(dist('delegate.js'));
const programador = buildTools('t', root, policyFor('programador'));
const testador = buildTools('t', root, policyFor('testador'));
const documentador = buildTools('t', root, policyFor('documentacao'));
const leitor = buildTools('t', root, policyFor('revisor'));

for (const role of ['explorador', 'revisor', 'seguranca', 'triagem']) {
  assert.deepEqual(Object.keys(buildTools('t', root, policyFor(role))).sort(), ['listDir', 'readFile', 'searchText']);
}
ok('explorador/revisor/seguranca/triagem não recebem ferramentas de escrita nem de execução');

// leitura
assert.match(await run(leitor, 'readFile', { path: 'src/a.ts' }), /export const a/);
await denied(() => run(leitor, 'readFile', { path: '.env' }));
await denied(() => run(leitor, 'readFile', { path: '../fora.txt' }));
await denied(() => run(leitor, 'readFile', { path: '/etc/passwd' }));
await denied(() => run(leitor, 'listDir', { path: '.git' }));
ok('leitura: .env, ../ e caminho absoluto são negados');

// programador
await run(programador, 'writeFile', { path: 'src/novo.ts', content: 'export {};\n' });
assert.ok(fs.existsSync(path.join(root, 'src', 'novo.ts')));
await denied(() => run(programador, 'writeFile', { path: 'src/novo.test.ts', content: 'x' }));
await denied(() => run(programador, 'writeFile', { path: '.env', content: 'x' }));
await denied(() => run(programador, 'writeFile', { path: '.mcp.json', content: '{}' }));
await denied(() => run(programador, 'writeFile', { path: 'tools/agent-mcp/src/server.ts', content: 'x' }));
await denied(() => run(programador, 'writeFile', { path: 'node_modules/x/index.js', content: 'x' }));
ok('programador escreve código; não escreve teste, .env, .mcp.json, o próprio MCP nem node_modules');

// replaceInFile: exige ocorrência única
await denied(() => run(programador, 'replaceInFile', { path: 'src/a.ts', oldString: '= 1', newString: '= 2' }));
await run(programador, 'replaceInFile', { path: 'src/a.ts', oldString: 'a = 1', newString: 'a = 2' });
assert.match(fs.readFileSync(path.join(root, 'src', 'a.ts'), 'utf8'), /a = 2/);
ok('replaceInFile recusa trecho ambíguo e aplica trecho único');

// testador
await run(testador, 'writeFile', { path: 'src/a.test.ts', content: 'test("x",()=>{});\n' });
await denied(() => run(testador, 'writeFile', { path: 'src/a.ts', content: 'x' }));
ok('testador escreve só arquivos de teste');

// documentação
await run(documentador, 'writeFile', { path: 'docs/uso.md', content: '# uso\n' });
await denied(() => run(documentador, 'writeFile', { path: 'src/a.ts', content: 'x' }));
await denied(() => run(documentador, 'writeFile', { path: 'CLAUDE.md', content: 'x' }));
assert.ok(!('runCheck' in documentador));
ok('documentação escreve só .md/docs, não toca CLAUDE.md e não executa checks');

// runCheck: testPath não pode ser flag nem sair do worktree
await denied(() => run(testador, 'runCheck', { check: 'test', testPath: '--help' }));
await denied(() => run(testador, 'runCheck', { check: 'test', testPath: '../x' }));
ok('runCheck rejeita testPath com flag ou fora do worktree');

fs.rmSync(root, { recursive: true, force: true });
console.log(`\nPolicy OK (${n} grupos)`);
