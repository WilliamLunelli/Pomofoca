/**
 * Provedores via CLI oficial: roda o worker com `claude -p` (assinatura Claude Pro/Max)
 * ou `gemini -p` (login Google / Google AI Pro), SEM chave de API.
 *
 * Cada CLI usa as próprias ferramentas (ler/editar arquivos, shell). As permissões do papel
 * são aplicadas em duas camadas:
 *   1. ANTES: flags de permissão de cada CLI (ferramentas liberadas/negadas, modo somente leitura).
 *   2. DEPOIS (determinístico): `enforceWritePolicy` olha o `git status` do worktree e desfaz
 *      qualquer arquivo que o papel não podia alterar. Não depende do modelo obedecer.
 *
 * Os CLIs rodam com o ambiente filtrado (childEnv): sem ANTHROPIC_API_KEY / GEMINI_API_KEY,
 * então usam o login salvo da assinatura, nunca cobrança de API.
 */
import fs from 'node:fs';
import path from 'node:path';
import spawn from 'cross-spawn';
import type { ModelSpec, Role } from './config.js';
import type { ToolPolicy } from './fs-tools.js';
import { childEnv, git, isProtectedPath, logsDir } from './workspace.js';

export type CliProvider = 'claude-cli' | 'gemini-cli';
export const isCliProvider = (p: string): p is CliProvider =>
  p === 'claude-cli' || p === 'gemini-cli';

export interface CliRequest {
  spec: ModelSpec & { provider: CliProvider };
  role: Role;
  /** Diretório onde o CLI roda (worktree da tarefa, ou raiz do repo para o explorador). */
  root: string;
  system: string;
  prompt: string;
  policy: ToolPolicy;
  timeoutMs: number;
}

export interface CliResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  steps: number;
}

// --------------------------------------------------------------- executável

/**
 * AGENT_CLAUDE_BIN / AGENT_GEMINI_BIN sobrescrevem o executável (útil para testes com um
 * CLI simulado). Se apontar para um .js/.mjs, roda com o próprio Node.
 */
function binFor(provider: CliProvider): { cmd: string; prefix: string[] } {
  const envName = provider === 'claude-cli' ? 'AGENT_CLAUDE_BIN' : 'AGENT_GEMINI_BIN';
  const override = process.env[envName]?.trim();
  if (override) {
    return /\.[cm]?js$/i.test(override)
      ? { cmd: process.execPath, prefix: [override] }
      : { cmd: override, prefix: [] };
  }
  return { cmd: provider === 'claude-cli' ? 'claude' : 'gemini', prefix: [] };
}

function cliEnv(): NodeJS.ProcessEnv {
  const env = childEnv();
  // Variáveis da sessão do Claude Code que chamou este MCP: não devem vazar para o worker.
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  delete env.CLAUDE_CODE_SSE_PORT;
  return env;
}

// ----------------------------------------------------------- argumentos por CLI

const CHECK_SCRIPTS = ['lint', 'test'];

function claudeArgs(req: CliRequest, systemFile: string): string[] {
  const writes = Boolean(req.policy.canWrite);
  const allowed = ['Read', 'Grep', 'Glob', 'LS'];
  const denied = ['WebFetch', 'WebSearch', 'Task', 'NotebookEdit', 'Read(**/.env*)'];
  if (writes) allowed.push('Edit', 'MultiEdit', 'Write');
  else denied.push('Edit', 'MultiEdit', 'Write');
  if (req.policy.canRunChecks) {
    for (const s of CHECK_SCRIPTS)
      allowed.push(`Bash(npm run ${s}:*)`, `Bash(npm run -s ${s}:*)`);
    allowed.push('Bash(npm test:*)', 'Bash(npx jest:*)');
  } else {
    denied.push('Bash');
  }
  return [
    '-p',
    '--output-format',
    'json',
    '--model',
    req.spec.model,
    '--append-system-prompt-file',
    systemFile,
    // Sem MCP no worker: evita recursão (o .mcp.json do repo registra ESTE servidor).
    '--strict-mcp-config',
    '--no-session-persistence',
    '--permission-mode',
    'default',
    '--allowedTools',
    allowed.join(','),
    '--disallowedTools',
    denied.join(','),
  ];
}

function geminiArgs(req: CliRequest): string[] {
  const writes = Boolean(req.policy.canWrite);
  const args = [
    '-p',
    'Siga as instruções recebidas na entrada padrão (stdin).',
    '--output-format',
    'json',
    '--model',
    req.spec.model,
    // plan = somente leitura; auto_edit = edita arquivos, mas shell só com allowed-tools.
    '--approval-mode',
    writes ? 'auto_edit' : 'plan',
    '--skip-trust',
    // Nenhum servidor MCP no worker (nome inexistente): evita recursão.
    '--allowed-mcp-server-names',
    '__nenhum__',
  ];
  if (req.policy.canRunChecks) {
    args.push(
      '--allowed-tools',
      ...CHECK_SCRIPTS.map((s) => `run_shell_command(npm run ${s})`),
      'run_shell_command(npm test)',
      'run_shell_command(npx jest)',
    );
  }
  return args;
}

// ------------------------------------------------------------ parse da saída

/** Extrai o objeto JSON final da saída (os CLIs às vezes imprimem avisos antes). */
export function lastJson(stdout: string): Record<string, unknown> | undefined {
  const end = stdout.lastIndexOf('}');
  if (end < 0) return undefined;
  for (
    let start = stdout.indexOf('{');
    start >= 0 && start < end;
    start = stdout.indexOf('{', start + 1)
  ) {
    try {
      const v = JSON.parse(stdout.slice(start, end + 1));
      if (v && typeof v === 'object' && !Array.isArray(v))
        return v as Record<string, unknown>;
    } catch {
      /* tenta o próximo "{" */
    }
  }
  return undefined;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' ? (v as Record<string, unknown>) : {};

export function parseClaude(
  json: Record<string, unknown>,
): CliResult & { isError: boolean } {
  const usage = obj(json.usage);
  return {
    text: typeof json.result === 'string' ? json.result : '',
    inputTokens:
      num(usage.input_tokens) +
      num(usage.cache_read_input_tokens) +
      num(usage.cache_creation_input_tokens),
    outputTokens: num(usage.output_tokens),
    steps: num(json.num_turns) || 1,
    isError: json.is_error === true,
  };
}

export function parseGemini(
  json: Record<string, unknown>,
): CliResult & { isError: boolean } {
  const stats = obj(json.stats);
  let inTok = 0;
  let outTok = 0;
  let requests = 0;
  for (const m of Object.values(obj(stats.models))) {
    const t = obj(obj(m).tokens);
    inTok += num(t.prompt) || num(t.input);
    outTok += num(t.candidates) + num(t.thoughts);
    requests += num(obj(obj(m).api).totalRequests);
  }
  const err = obj(json.error);
  return {
    text:
      typeof json.response === 'string'
        ? json.response
        : typeof err.message === 'string'
          ? err.message
          : '',
    inputTokens: inTok,
    outputTokens: outTok,
    steps: requests || num(obj(stats.tools).totalCalls) + 1,
    isError: Object.keys(err).length > 0,
  };
}

// -------------------------------------------------------------- execução

interface Proc {
  code: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

function killTree(pid: number | undefined): void {
  if (!pid) return;
  if (process.platform === 'win32') {
    spawn.sync('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      /* já saiu */
    }
  }
}

function exec(
  cmd: string,
  args: string[],
  cwd: string,
  stdin: string,
  timeoutMs: number,
): Promise<Proc> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, env: cliEnv(), windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    child.stdout?.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr?.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ code: -1, stdout, stderr: stderr + String(e.message), timedOut });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? -1, stdout, stderr, timedOut });
    });
    // O prompt vai por stdin: diffs grandes estourariam o limite de linha de comando do Windows.
    child.stdin?.on('error', () => {});
    child.stdin?.end(stdin);
  });
}

const LOGIN_HINT: Record<CliProvider, string> = {
  'claude-cli': 'Rode `claude` uma vez num terminal e faça login com a conta Claude Pro.',
  'gemini-cli': 'Rode `gemini` uma vez num terminal e escolha "Login with Google".',
};

export async function runCli(req: CliRequest): Promise<CliResult> {
  const { cmd, prefix } = binFor(req.spec.provider);
  let args: string[];
  let stdin: string;
  let systemFile: string | undefined;
  if (req.spec.provider === 'claude-cli') {
    const dir = path.join(logsDir(), 'prompts');
    fs.mkdirSync(dir, { recursive: true });
    systemFile = path.join(dir, `${req.role}-${process.pid}-${Date.now()}.md`);
    fs.writeFileSync(systemFile, req.system);
    args = claudeArgs(req, systemFile);
    stdin = req.prompt;
  } else {
    args = geminiArgs(req);
    // O Gemini CLI não aceita system prompt complementar por flag: vai no topo da entrada.
    stdin = `# Instruções do seu papel\n${req.system}\n\n---\n\n${req.prompt}`;
  }

  try {
    const r = await exec(cmd, [...prefix, ...args], req.root, stdin, req.timeoutMs);
    if (r.timedOut)
      throw new Error(`timeout de ${Math.round(req.timeoutMs / 1000)}s no ${cmd}.`);
    if (r.code === -1 && /ENOENT/.test(r.stderr)) {
      throw new Error(
        `"${cmd}" não encontrado no PATH. Instale o CLI e reinicie o cliente MCP.`,
      );
    }
    // O Gemini CLI escreve o JSON de erro (ex.: sem login) no stderr.
    const json = lastJson(r.stdout) ?? lastJson(r.stderr);
    if (!json) {
      const detail = (r.stderr || r.stdout).trim().slice(-800);
      const auth = /auth|login|credential|unauthori|401|403/i.test(detail);
      throw new Error(
        `${cmd} saiu com código ${r.code} sem JSON.${auth ? ` ${LOGIN_HINT[req.spec.provider]}` : ''}\n${detail}`,
      );
    }
    const parsed =
      req.spec.provider === 'claude-cli' ? parseClaude(json) : parseGemini(json);
    if (parsed.isError) {
      const auth = /auth|login|credential|unauthori|api key/i.test(parsed.text);
      throw new Error(
        `${cmd} retornou erro: ${parsed.text.slice(0, 600)}${auth ? ` ${LOGIN_HINT[req.spec.provider]}` : ''}`,
      );
    }
    const { isError: _ignored, ...result } = parsed;
    return result;
  } finally {
    if (systemFile) fs.rmSync(systemFile, { force: true });
  }
}

// -------------------------------------------------- política de escrita (pós-execução)

/** `git status` do worktree: caminhos alterados/novos, relativos à raiz, com "/". */
export async function changedPaths(dir: string): Promise<string[]> {
  const st = await git(dir, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  const out: string[] = [];
  const recs = st.stdout.split('\0');
  for (let i = 0; i < recs.length; i++) {
    const rec = recs[i];
    if (!rec || rec.length < 4) continue;
    const xy = rec.slice(0, 2);
    out.push(rec.slice(3));
    if (xy.includes('R') || xy.includes('C')) {
      const from = recs[++i];
      if (from) out.push(from); // origem do rename também conta como alterada
    }
  }
  return out.filter((p) => !p.split('/').includes('node_modules'));
}

/**
 * Desfaz no worktree todo arquivo que o papel não podia alterar. Retorna os caminhos revertidos.
 * Só use em worktrees de tarefa (nunca na sua branch de trabalho).
 */
export async function enforceWritePolicy(
  dir: string,
  policy: ToolPolicy,
): Promise<string[]> {
  const reverted: string[] = [];
  for (const p of await changedPaths(dir)) {
    const ok = policy.canWrite ? policy.canWrite(p) && !isProtectedPath(p) : false;
    if (ok) continue;
    const inHead = (await git(dir, ['cat-file', '-e', `HEAD:${p}`])).code === 0;
    if (inHead) {
      await git(dir, ['restore', '--source=HEAD', '--staged', '--worktree', '--', p]);
    } else {
      await git(dir, ['rm', '-q', '--cached', '--ignore-unmatch', '--', p]);
      fs.rmSync(path.join(dir, p), { force: true, recursive: true });
    }
    reverted.push(p);
  }
  return reverted;
}
