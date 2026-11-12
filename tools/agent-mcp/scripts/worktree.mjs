// Ensaio: abrir tarefa num repo descartável COM node_modules (raiz e em apps/x), fechar,
// e provar que os node_modules reais continuam intactos.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));
const dist = (f) => pathToFileURL(path.join(here, '..', 'dist', f)).href;
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'junction-'));
const git = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' }).toString();
fs.mkdirSync(path.join(repo, 'apps', 'x'), { recursive: true });
fs.writeFileSync(path.join(repo, 'apps', 'x', 'index.js'), '1');
fs.writeFileSync(path.join(repo, '.gitignore'), 'node_modules/\n');
git('init', '-q', '-b', 'main'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'add', '-A'); git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'i');
for (const p of ['node_modules/pkg', 'apps/x/node_modules/pkg2']) { fs.mkdirSync(path.join(repo, p), { recursive: true }); fs.writeFileSync(path.join(repo, p, 'index.js'), 'REAL'); }
process.env.AGENT_REPO_ROOT = repo;
const { openTask, closeTask } = await import(dist('workspace.js'));
const { changedPaths } = await import(dist('cli-runner.js'));
const { meta } = await openTask('jt');
const wtnm = path.join(meta.dir, 'node_modules');
assert.ok(fs.lstatSync(wtnm).isSymbolicLink());
assert.equal(fs.readFileSync(path.join(wtnm, 'pkg', 'index.js'), 'utf8'), 'REAL');
assert.ok(fs.lstatSync(path.join(meta.dir, 'apps/x/node_modules')).isSymbolicLink());
assert.deepEqual(await changedPaths(meta.dir), []);
await closeTask('jt');
assert.ok(!fs.existsSync(meta.dir));
assert.equal(fs.readFileSync(path.join(repo, 'node_modules/pkg/index.js'), 'utf8'), 'REAL');
assert.equal(fs.readFileSync(path.join(repo, 'apps/x/node_modules/pkg2/index.js'), 'utf8'), 'REAL');
console.log('Worktree OK (node_modules linkado no worktree; reais intactos após tarefa_encerrar)');
