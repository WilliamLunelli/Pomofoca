/**
 * Worktrees git por tarefa + helpers seguros de processo/arquivo.
 * Cada tarefa roda numa branch própria (agent/<taskId>) num worktree isolado,
 * então workers em paralelo não pisam no trabalho um do outro nem na sua branch atual.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { repoRoot } from './config.js';

const pexec = promisify(execFile);

export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Ambiente dos processos filhos: sem chaves de API/tokens (código gerado por LLM roda aqui). */
export function childEnv(): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const [k, v] of Object.entries(process.env)) {
    // GIT_CONFIG_KEY_n / GIT_CONFIG_VALUE_n são configuração do git (casam com "KEY" mas não são segredos).
    if (!k.startsWith('GIT_CONFIG_') && /KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL/i.test(k))
      continue;
    out[k] = v;
  }
  out.CI = '1';
  return out;
}

/**
 * No Windows, o lançador do npm (e irmãos do ecossistema JS) é um shim .cmd,
 * não um .exe de verdade - um .cmd é um script de batch, e a API de processo
 * do Windows (CreateProcess) não consegue executá-lo diretamente como se
 * fosse um binário, mesmo apontando pro nome certo (".cmd"): precisa passar
 * por um interpretador (cmd.exe), daí "spawn EINVAL" mesmo com o nome certo.
 * git, em contraste, já instala como git.exe de verdade - nem precisa disso
 * (e "git.cmd" nem existe). Por isso é uma lista exata dos shims conhecidos,
 * com shell:true só pra esses, não um sufixo/flag aplicado a qualquer comando.
 */
const WINDOWS_CMD_SHIMS = new Set(['npm', 'npx', 'yarn', 'pnpm']);
function needsWindowsShell(cmd: string): boolean {
  return process.platform === 'win32' && WINDOWS_CMD_SHIMS.has(cmd);
}

export async function run(
  cmd: string,
  args: string[],
  opts: { cwd: string; timeoutMs?: number },
): Promise<ExecResult> {
  try {
    const { stdout, stderr } = await pexec(cmd, args, {
      cwd: opts.cwd,
      timeout: opts.timeoutMs ?? 120_000,
      maxBuffer: 16 * 1024 * 1024,
      env: childEnv(),
      shell: needsWindowsShell(cmd),
    });
    return { code: 0, stdout, stderr, timedOut: false };
  } catch (e) {
    const err = e as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      killed?: boolean;
      code?: number | string;
    };
    return {
      code: typeof err.code === 'number' ? err.code : 1,
      stdout: err.stdout ?? '',
      stderr: err.stderr ?? String(err.message),
      timedOut: err.killed === true,
    };
  }
}

export const git = (cwd: string, args: string[]) => run('git', args, { cwd });

// ---------------------------------------------------------------- diretórios

export const logsDir = () => path.join(repoRoot(), '.agent-logs');
export const worktreesDir = () => path.join(repoRoot(), '.agent-worktrees');

// ------------------------------------------------------------------- tarefas

export interface TaskMeta {
  id: string;
  branch: string;
  base: string; // SHA de partida
  dir: string;
  createdAt: string;
  closed?: boolean;
}

const TASK_ID = /^[a-z0-9][a-z0-9-]{1,40}$/;
const metaFile = (id: string) => path.join(logsDir(), 'tasks', `${id}.json`);

export function assertTaskId(id: string): void {
  if (!TASK_ID.test(id)) {
    throw new Error(
      'taskId inválido: use minúsculas, números e hífens (2-41 chars), ex.: "relatorio-mensal".',
    );
  }
}

export function getTask(id: string): TaskMeta | undefined {
  assertTaskId(id);
  try {
    const meta = JSON.parse(fs.readFileSync(metaFile(id), 'utf8')) as TaskMeta;
    return meta.closed ? undefined : meta;
  } catch {
    return undefined;
  }
}

export function requireTask(id: string): TaskMeta {
  const t = getTask(id);
  if (!t || !fs.existsSync(t.dir)) {
    throw new Error(`Tarefa "${id}" não está aberta. Chame tarefa_abrir primeiro.`);
  }
  return t;
}

/** Symlinka node_modules do repo principal (raiz e pastas de 1º/2º nível) para o worktree. */
function linkNodeModules(root: string, dir: string): void {
  const candidates = ['.'];
  for (const first of fs.readdirSync(root, { withFileTypes: true })) {
    if (
      !first.isDirectory() ||
      first.name.startsWith('.') ||
      first.name === 'node_modules'
    )
      continue;
    candidates.push(first.name);
    try {
      for (const second of fs.readdirSync(path.join(root, first.name), {
        withFileTypes: true,
      })) {
        if (
          second.isDirectory() &&
          !second.name.startsWith('.') &&
          second.name !== 'node_modules'
        ) {
          candidates.push(path.join(first.name, second.name));
        }
      }
    } catch {
      /* ignora */
    }
  }
  for (const rel of candidates) {
    const src = path.join(root, rel, 'node_modules');
    const dst = path.join(dir, rel, 'node_modules');
    if (fs.existsSync(src) && fs.existsSync(path.dirname(dst)) && !fs.existsSync(dst)) {
      // Windows: junction não exige modo de desenvolvedor/admin (symlink 'dir' dá EPERM).
      fs.symlinkSync(src, dst, process.platform === 'win32' ? 'junction' : 'dir');
    }
  }
}

export async function openTask(
  id: string,
  base = 'HEAD',
): Promise<{ meta: TaskMeta; reused: boolean }> {
  assertTaskId(id);
  if (!/^[\w./~^@-]+$/.test(base) || base.startsWith('-'))
    throw new Error('base inválida.');
  const existing = getTask(id);
  if (existing && fs.existsSync(existing.dir)) return { meta: existing, reused: true };

  const root = repoRoot();
  const sha = await git(root, ['rev-parse', '--verify', `${base}^{commit}`]);
  if (sha.code !== 0)
    throw new Error(`Base "${base}" não encontrada: ${sha.stderr.trim()}`);

  const dir = path.join(worktreesDir(), id);
  const branch = `agent/${id}`;
  const add = await git(root, ['worktree', 'add', '-b', branch, dir, sha.stdout.trim()]);
  if (add.code !== 0) {
    throw new Error(
      `Falha ao criar worktree (a branch ${branch} já existe?): ${add.stderr.trim()}`,
    );
  }
  linkNodeModules(root, dir);

  const meta: TaskMeta = {
    id,
    branch,
    base: sha.stdout.trim(),
    dir,
    createdAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(metaFile(id)), { recursive: true });
  fs.writeFileSync(metaFile(id), JSON.stringify(meta, null, 2));
  return { meta, reused: false };
}

/** Remove o worktree, mas MANTÉM a branch (nunca apagamos trabalho; o merge é decisão sua/do gestor). */
/**
 * Desfaz os links criados por linkNodeModules (raiz e até 2 níveis), sem tocar no alvo.
 * Só remove o que é link (symlink ou junction); um node_modules real dentro do worktree fica.
 */
export function unlinkNodeModules(dir: string): string[] {
  const removed: string[] = [];
  const visit = (rel: string, depth: number) => {
    const nm = path.join(dir, rel, 'node_modules');
    try {
      if (fs.lstatSync(nm).isSymbolicLink()) {
        // No Node, junction também aparece como symbolic link; unlink remove só o link.
        fs.unlinkSync(nm);
        removed.push(path.join(rel, 'node_modules'));
      }
    } catch {
      /* não existe */
    }
    if (depth >= 2) return;
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(path.join(dir, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') {
        visit(path.join(rel, e.name), depth + 1);
      }
    }
  };
  visit('.', 0);
  return removed;
}

export async function closeTask(id: string): Promise<TaskMeta> {
  const meta = requireTask(id);
  // Remove os links de node_modules ANTES, para o `worktree remove` nunca atravessar um
  // link/junction e apagar o node_modules REAL do repositório principal.
  unlinkNodeModules(meta.dir);
  const rm = await git(repoRoot(), ['worktree', 'remove', '--force', meta.dir]);
  if (rm.code !== 0) throw new Error(`Falha ao remover worktree: ${rm.stderr.trim()}`);
  fs.writeFileSync(metaFile(id), JSON.stringify({ ...meta, closed: true }, null, 2));
  return meta;
}

/** Commit de checkpoint na branch da tarefa (exclui node_modules, inclusive symlinks). */
export async function checkpoint(dir: string, message: string): Promise<boolean> {
  await git(dir, [
    'add',
    '-A',
    '--',
    '.',
    ':(exclude)node_modules',
    ':(exclude)**/node_modules',
  ]);
  const st = await git(dir, ['status', '--porcelain']);
  if (!st.stdout.trim()) return false;
  const c = await git(dir, [
    '-c',
    'user.name=agent-mcp',
    '-c',
    'user.email=agent-mcp@localhost',
    'commit',
    '--no-verify',
    '-m',
    message,
  ]);
  return c.code === 0;
}

// ------------------------------------------------------------ caminhos seguros

/** Segmentos que nenhum worker lê nem escreve. */
const DENY_SEGMENTS = new Set([
  '.git',
  'node_modules',
  '.agent-logs',
  '.agent-worktrees',
]);

export function resolveInside(root: string, rel: string): string {
  const abs = path.resolve(root, rel);
  const r = path.relative(root, abs);
  if (r.startsWith('..') || path.isAbsolute(r))
    throw new Error('Caminho fora do worktree.');
  return abs;
}

export function assertReadable(root: string, rel: string): string {
  const abs = resolveInside(root, rel);
  const parts = path.relative(root, abs).split(path.sep);
  if (parts.some((p) => DENY_SEGMENTS.has(p) || /^\.env/.test(p))) {
    throw new Error(`Acesso negado: ${rel}`);
  }
  return abs;
}

/** Arquivos que workers nunca alteram, qualquer que seja o papel. */
export function isProtectedPath(rel: string): boolean {
  const p = rel.split(path.sep).join('/').replace(/^\.\//, '');
  return (
    p === '.mcp.json' ||
    p === 'package-lock.json' ||
    p === 'pnpm-lock.yaml' ||
    p === 'yarn.lock' ||
    p === 'CLAUDE.md' ||
    p === 'CONVENTIONS.md' ||
    p.startsWith('.claude/') ||
    p.startsWith('.github/') ||
    p.startsWith('tools/agent-mcp/')
  );
}

export const isTestPath = (rel: string): boolean => {
  const p = rel.split(path.sep).join('/');
  return (
    /(^|\/)(__tests__|__mocks__|tests?|e2e)\//.test(p) ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(p)
  );
};

export const isDocPath = (rel: string): boolean => {
  const p = rel.split(path.sep).join('/');
  return /\.mdx?$/i.test(p) || p.startsWith('docs/');
};
