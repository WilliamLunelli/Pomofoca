/**
 * Provedores via CLI oficial, SEM chave de API:
 *   - `claude-cli`: `claude -p` (assinatura Claude Pro/Max)
 *   - `agy`: `agy -p` (Antigravity CLI, login Google pessoal: Free / AI Pro / Ultra).
 *     Substitui o Gemini CLI, que deixou de aceitar contas pessoais em 18/06/2026.
 *
 * Cada CLI usa as próprias ferramentas (ler/editar arquivos, shell). As permissões do papel
 * são aplicadas em duas camadas:
 *   1. ANTES: regras de permissão de cada CLI (ferramentas liberadas/negadas). Em modo headless,
 *      o que não estiver liberado é negado automaticamente pelos dois CLIs.
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

export type CliProvider = 'claude-cli' | 'agy';
export const isCliProvider = (p: string): p is CliProvider =>
  p === 'claude-cli' || p === 'agy';

export interface CliRequest {
  spec: ModelSpec & { provider: CliProvider };
  role: Role;
  /** Diretório onde o CLI roda (worktree da tarefa, ou raiz do repo para o explorador). */
  root: string;
  system: string;
  prompt: string;
  policy: ToolPolicy;
  timeoutMs: number;
  /**
   * Prefixo (relativo a .agent-logs/) da transcrição ao vivo: o stdout do agy é gravado em
   * `<prefixo>.<tentativa>.jsonl` À MEDIDA que chega, para o painel acompanhar.
   */
  transcriptBase?: string;
}

export interface CliResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  steps: number;
  /** Avisos para o gestor (ex.: ações que o CLI negou por falta de permissão). */
  notes: string[];
  /** Transcrições gravadas (relativas a .agent-logs/). */
  transcripts?: string[];
}

type Parsed = Omit<CliResult, 'notes'> & { isError: boolean; notes?: string[] };

// --------------------------------------------------------------- executável

/**
 * AGENT_CLAUDE_BIN / AGENT_AGY_BIN sobrescrevem o executável (útil para testes com um
 * CLI simulado). Se apontar para um .js/.mjs, roda com o próprio Node.
 */
function binFor(provider: CliProvider): { cmd: string; prefix: string[] } {
  const envName = provider === 'claude-cli' ? 'AGENT_CLAUDE_BIN' : 'AGENT_AGY_BIN';
  const override = process.env[envName]?.trim();
  if (override) {
    return /\.[cm]?js$/i.test(override)
      ? { cmd: process.execPath, prefix: [override] }
      : { cmd: override, prefix: [] };
  }
  if (provider === 'agy' && process.platform === 'win32' && process.env.LOCALAPPDATA) {
    // O instalador põe o agy em %LOCALAPPDATA%\agy\bin; o PATH do cliente MCP pode ainda
    // não ter essa pasta se ele foi aberto antes da instalação.
    const exe = path.join(process.env.LOCALAPPDATA, 'agy', 'bin', 'agy.exe');
    if (fs.existsSync(exe)) return { cmd: exe, prefix: [] };
  }
  return { cmd: provider === 'claude-cli' ? 'claude' : 'agy', prefix: [] };
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
/** Comandos de check liberados para papéis com canRunChecks (casamento por prefixo). */
const CHECK_COMMANDS = [
  ...CHECK_SCRIPTS.flatMap((s) => [`npm run ${s}`, `npm run -s ${s}`]),
  'npm test',
  'npx jest',
];

function claudeArgs(req: CliRequest, systemFile: string): string[] {
  const writes = Boolean(req.policy.canWrite);
  const allowed = ['Read', 'Grep', 'Glob', 'LS'];
  const denied = ['WebFetch', 'WebSearch', 'Task', 'NotebookEdit', 'Read(**/.env*)'];
  // git rm: única forma de APAGAR arquivo; a política pós-execução desfaz remoções proibidas.
  if (writes) allowed.push('Edit', 'MultiEdit', 'Write', 'Bash(git rm:*)');
  else denied.push('Edit', 'MultiEdit', 'Write');
  if (req.policy.canRunChecks) allowed.push(...CHECK_COMMANDS.map((c) => `Bash(${c}:*)`));
  else denied.push('Bash');
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

/**
 * Comandos SÓ DE LEITURA liberados para todo papel no agy. O Gemini quase sempre começa
 * explorando pelo shell (ex.: `Get-ChildItem -Force`), e no modo headless um comando negado
 * ENCERRA a execução inteira com resposta vazia, então listar/ler/buscar precisa estar liberado.
 */
const AGY_READ_COMMANDS = [
  'Get-ChildItem',
  'Get-Content',
  'Select-String',
  'Select-Object',
  'Sort-Object',
  'Measure-Object',
  'Get-Location',
  'ls',
  'dir',
  'cat',
  'type',
  'pwd',
  'rg',
  'findstr',
  'git status',
  'git diff',
  'git log',
  'git show',
  'git ls-files',
  'git grep',
];

/** Comandos de escrita liberados para papéis que escrevem (apagar arquivo). */
const WRITE_COMMANDS = ['git rm'];

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Regex (RE2, ancorada) da linha de comando inteira: um ou mais SEGMENTOS ligados por `;`, `&&`
 * ou `|`, e CADA segmento precisa ser um comando liberado com argumentos sem ; & | < > ` $ nem
 * quebra de linha. O Gemini encadeia muito (`git status; git log -n 5`): isso passa, mas
 * `ls | Remove-Item`, redirecionamento e `$(...)` não.
 */
export function commandRegex(commands: string[]): string {
  const seg = `(${commands.map(escapeRe).join('|')})( [^;&|<>\`$\\r\\n]*)?`;
  return `regex:^\\s*${seg}(\\s*(;|&&|\\|)\\s*${seg})*\\s*$`;
}

/**
 * Regras de permissão do agy para a sessão (`--settings`). Precedência: deny > ask > allow.
 * Sem regra, o agy lê/escreve dentro da pasta de trabalho e, em headless, NEGA o resto
 * (comandos fora da lista, web, MCP), já que não há como perguntar.
 */
export function agySettings(policy: ToolPolicy): {
  permissions: { allow: string[]; deny: string[] };
} {
  const deny = [
    'read_url(*)',
    'execute_url(*)',
    'mcp(*)', // sem MCP no worker: evita recursão
    'read_file(.env)',
    'read_file(.env.local)',
    'read_file(.env.production)',
    // deny vence allow. Os comandos de leitura liberados aceitam caminhos como argumento, então
    // estas regras impedem sair da pasta de trabalho pelo terminal (visto em teste real: o Gemini
    // listou e leu `..\..\.agent-logs` a partir do worktree).
    'command(regex:.*\\.env.*)', // .env em qualquer lugar da linha
    'command(regex:.*\\.\\..*)', // `..` (subir de pasta)
    'command(regex:.*[A-Za-z]:[\\\\/].*)', // caminho absoluto Windows (C:\ ou C:/)
    'command(regex:.*(^|[\\s"\'=])[\\\\/~].*)', // argumento começando com \ / ou ~
    'command(regex:.*\\.agent-.*)', // pastas internas deste servidor
  ];
  // Uma regra regex só: no agy 1.5.6 a regra por prefixo `command(Get-ChildItem)` não casa
  // com `Get-ChildItem -Force`; a forma regex casa. Checks entram na mesma lista para poder
  // encadear (ex.: `npm run lint; npm run test`).
  const cmds = [
    ...AGY_READ_COMMANDS,
    ...(policy.canWrite ? WRITE_COMMANDS : []),
    ...(policy.canRunChecks ? CHECK_COMMANDS : []),
  ];
  const allow = [`command(${commandRegex(cmds)})`];
  if (!policy.canWrite) deny.push('write_file(*)');
  return { permissions: { allow, deny } };
}

/** Aviso no topo do prompt do agy: comando fora da lista encerra a execução. */
function agyRules(policy: ToolPolicy): string {
  const cmds = [
    ...AGY_READ_COMMANDS,
    ...(policy.canWrite ? WRITE_COMMANDS : []),
    ...(policy.canRunChecks ? CHECK_COMMANDS : []),
  ];
  return [
    '# Regras desta execução (modo não interativo)',
    `- Comandos de terminal liberados: ${cmds.join(', ')}. Pode encadear com ";", "&&" ou "|" só entre comandos dessa lista; nada de redirecionamento (>, <) nem $(...).`,
    '- QUALQUER outro comando é negado e ENCERRA sua execução sem resultado. Prefira as ferramentas de arquivo (listar, ver, buscar' +
      (policy.canWrite ? ', criar e editar arquivos' : '') +
      ') em vez do terminal.',
    policy.canWrite
      ? '- Crie e edite arquivos com as ferramentas de arquivo; para APAGAR um arquivo use `git rm <caminho>`.'
      : '- Você NÃO pode criar nem alterar arquivos nesta execução: só leia e responda.',
    '- Trabalhe só dentro da pasta atual: caminhos relativos, sem "..", sem caminho absoluto, sem ~.',
    '- Sem acesso à web nem a arquivos .env.',
  ].join('\n');
}

/** Uma mensagem de usuário no formato `--input-format stream-json` do agy (uma linha NDJSON). */
export const agyInput = (content: string): string =>
  `${JSON.stringify({ event: 'user', message: { content } })}\n`;

function agyArgs(req: CliRequest, settingsFile: string): string[] {
  const args = [
    // Prompt por stdin em NDJSON (ver agyInput). Visto em teste real (agy 1.5.6): com
    // `-p "<texto>"` o stdin em modo texto é IGNORADO — o modelo nunca recebia a tarefa e saía
    // vasculhando a pasta. Sem -p, `--input-format stream-json` já roda em modo não interativo.
    '--input-format',
    'stream-json',
    // stream-json: além do envelope final (evento "result"), mostra cada ferramenta usada,
    // o que permite dizer ao gestor QUAL comando foi negado.
    '--output-format',
    'stream-json',
    '--model',
    req.spec.model,
    '--settings',
    settingsFile,
    '--disable-slash-commands',
    '--print-timeout',
    `${Math.max(1, Math.round(req.timeoutMs / 1000) - 5)}s`,
  ];
  // accept-edits: aplica edições sem pedir revisão de diff (headless não tem como revisar).
  // Não use "plan": no agy ele só faz o modelo planejar, não é somente leitura.
  if (req.policy.canWrite) args.push('--mode', 'accept-edits');
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
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

export function parseClaude(json: Record<string, unknown>): Parsed {
  const usage = obj(json.usage);
  return {
    text: str(json.result),
    inputTokens:
      num(usage.input_tokens) +
      num(usage.cache_read_input_tokens) +
      num(usage.cache_creation_input_tokens),
    outputTokens: num(usage.output_tokens),
    steps: num(json.num_turns) || 1,
    isError: json.is_error === true,
  };
}

export interface AgyStream {
  /** Envelope final (evento "result"), ou o último JSON da saída se não houver stream. */
  envelope?: Record<string, unknown>;
  /** Linhas de comando que falharam (negadas ou com erro), na ordem. */
  failedCommands: string[];
  /** Quantas chamadas de ferramenta terminaram. */
  toolSteps: number;
}

/** Lê a saída `--output-format stream-json` do agy (NDJSON, um evento por linha). */
export function parseAgyStream(stdout: string): AgyStream {
  const out: AgyStream = { failedCommands: [], toolSteps: 0 };
  for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim().startsWith('{')) continue;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (ev.event === 'result') {
      out.envelope = obj(ev.result);
    } else if (ev.event === 'step_update') {
      const step = obj(ev.step_update);
      if (step.step_type !== 'tool' || (step.state !== 'DONE' && step.state !== 'ERROR'))
        continue;
      out.toolSteps++;
      if (step.state === 'ERROR' && step.tool_name === 'run_command') {
        const cmdLine = str(obj(obj(step.tool_info).parameters).CommandLine);
        if (cmdLine) out.failedCommands.push(cmdLine);
      }
    }
  }
  out.envelope ??= lastJson(stdout);
  return out;
}

/** Envelope final do `agy -p` (mesmo formato em `json` e no evento "result" do `stream-json`). */
export function parseAgy(json: Record<string, unknown>): Parsed {
  const usage = obj(json.usage);
  const err = json.error;
  const errText = typeof err === 'string' ? err : str(obj(err).message);
  const denied = Array.isArray(json.denied_actions)
    ? json.denied_actions.map((d) => {
        const o = obj(d);
        return str(o.display_name) || str(o.action) || 'ação';
      })
    : [];
  const status = str(json.status);
  return {
    text: str(json.response) || errText,
    inputTokens: num(usage.input_tokens) + num(usage.cache_read_tokens),
    outputTokens: num(usage.output_tokens),
    steps: num(json.num_turns) || 1,
    isError: Boolean(errText) || (status !== '' && status !== 'SUCCESS'),
    notes: denied.length
      ? [
          `NEGADO pelo agy (fora da permissão do papel): ${[...new Set(denied)].join(', ')}`,
        ]
      : [],
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
  teeFile?: string,
): Promise<Proc> {
  return new Promise((resolve) => {
    if (teeFile) {
      fs.mkdirSync(path.dirname(teeFile), { recursive: true });
      fs.writeFileSync(teeFile, '');
    }
    const child = spawn(cmd, args, { cwd, env: cliEnv(), windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child.pid);
    }, timeoutMs);
    child.stdout?.setEncoding('utf8').on('data', (d: string) => {
      stdout += d;
      if (teeFile) {
        try {
          fs.appendFileSync(teeFile, d);
        } catch {
          /* transcrição é só para o painel; não derruba o worker */
        }
      }
    });
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
  agy: 'Rode `agy` uma vez num terminal e faça login com a sua conta Google.',
};

export async function runCli(req: CliRequest): Promise<CliResult> {
  const { cmd, prefix } = binFor(req.spec.provider);
  const label = req.spec.provider === 'claude-cli' ? 'claude' : 'agy';
  const dir = path.join(logsDir(), 'prompts');
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `${req.role}-${process.pid}-${Date.now()}`);
  let args: string[];
  let stdin: string;
  let tmpFile: string;
  if (req.spec.provider === 'claude-cli') {
    tmpFile = `${tmp}.system.md`;
    fs.writeFileSync(tmpFile, req.system);
    args = claudeArgs(req, tmpFile);
    stdin = req.prompt;
  } else {
    tmpFile = `${tmp}.settings.json`;
    fs.writeFileSync(tmpFile, JSON.stringify(agySettings(req.policy), null, 2));
    args = agyArgs(req, tmpFile);
    // O agy não tem flag de system prompt complementar: as instruções do papel vão no topo.
    stdin = agyInput(
      `# Instruções do seu papel\n${req.system}\n\n${agyRules(req.policy)}\n\n---\n\n${req.prompt}`,
    );
  }

  const deadline = Date.now() + req.timeoutMs;
  const base = req.transcriptBase ?? path.join('agy', path.basename(tmp));
  const transcripts: string[] = [];
  /** Uma execução do CLI: valida a saída e devolve o resultado parseado. */
  const once = async (runArgs: string[], input: string, attempt: number) => {
    const left = deadline - Date.now();
    if (left < 5_000)
      throw new Error(`timeout de ${Math.round(req.timeoutMs / 1000)}s no ${label}.`);
    let tee: string | undefined;
    if (req.spec.provider === 'agy') {
      const rel = `${base}.${attempt}.jsonl`;
      transcripts.push(rel);
      tee = path.join(logsDir(), rel);
    }
    const r = await exec(cmd, [...prefix, ...runArgs], req.root, input, left, tee);
    if (r.timedOut)
      throw new Error(`timeout de ${Math.round(req.timeoutMs / 1000)}s no ${label}.`);
    if (r.code === -1 && /ENOENT/.test(r.stderr)) {
      throw new Error(
        `"${label}" (${cmd}) não encontrado no PATH. Instale o CLI e reinicie o cliente MCP.`,
      );
    }
    let json: Record<string, unknown> | undefined;
    let stream: AgyStream | undefined;
    if (req.spec.provider === 'agy') {
      stream = parseAgyStream(r.stdout);
      // A transcrição completa já foi gravada ao vivo (tee) em .agent-logs/<base>.<n>.jsonl.
      json = stream.envelope ?? lastJson(r.stderr);
    } else {
      json = lastJson(r.stdout) ?? lastJson(r.stderr);
    }
    if (!json) {
      const detail = (r.stderr || r.stdout).trim().slice(-800);
      const auth = /auth|login|credential|unauthori|401|403/i.test(detail);
      throw new Error(
        `${label} saiu com código ${r.code} sem JSON.${auth ? ` ${LOGIN_HINT[req.spec.provider]}` : ''}\n${detail}`,
      );
    }
    const parsed =
      req.spec.provider === 'claude-cli' ? parseClaude(json) : parseAgy(json);
    if (parsed.isError) {
      const auth = /auth|login|credential|unauthori|api key/i.test(parsed.text);
      throw new Error(
        `${label} retornou erro: ${parsed.text.slice(0, 600)}${auth ? ` ${LOGIN_HINT[req.spec.provider]}` : ''}`,
      );
    }
    return { r, json, stream, parsed };
  };

  try {
    let { r, json, stream, parsed } = await once(args, stdin, 0);
    const { isError: _ignored, notes = [], ...result } = parsed;
    const failed = [...(stream?.failedCommands ?? [])];
    let toolSteps = stream?.toolSteps ?? 0;

    // agy em headless: uma ação negada ENCERRA a execução com resposta vazia. Retoma a mesma
    // conversa avisando o que foi negado, até AGY_MAX_RESUMES vezes, para o worker terminar
    // o trabalho pelo caminho permitido e entregar o relatório.
    for (
      let attempt = 1;
      req.spec.provider === 'agy' &&
      attempt <= AGY_MAX_RESUMES &&
      !result.text.trim() &&
      Array.isArray(json.denied_actions) &&
      json.denied_actions.length > 0 &&
      typeof json.conversation_id === 'string';
      attempt++
    ) {
      const negados = stream?.failedCommands.length
        ? stream.failedCommands.map((c) => `\`${c.slice(0, 200)}\``).join(', ')
        : 'uma ação fora das regras';
      const resume = [
        `Sua última ação foi NEGADA pelas regras desta execução: ${negados}.`,
        'Não repita nem tente contornar. Continue a TAREFA ORIGINAL usando só as ferramentas de arquivo',
        'e os comandos liberados, sem sair da pasta atual, e termine com o relatório no formato pedido.',
      ].join(' ');
      ({ r, json, stream, parsed } = await once(
        [...args, '--conversation', json.conversation_id],
        agyInput(resume),
        attempt,
      ));
      result.text = parsed.text;
      result.inputTokens += parsed.inputTokens;
      result.outputTokens += parsed.outputTokens;
      failed.push(...(stream?.failedCommands ?? []));
      toolSteps += stream?.toolSteps ?? 0;
      notes.push(...(parsed.notes ?? []));
      notes.push(`Execução retomada após negação (${attempt}/${AGY_MAX_RESUMES}).`);
    }

    if (toolSteps) result.steps = toolSteps + 1;
    if (failed.length) {
      notes.push(
        `Comandos negados/falhos: ${failed
          .slice(-5)
          .map((c) => `\`${c.slice(0, 120)}\``)
          .join(', ')}`,
      );
    }
    // Resposta vazia: o agy explica o motivo (ex.: permissão negada) no stderr.
    if (!result.text.trim() && r.stderr.trim()) {
      notes.push(`stderr do ${label}: ${r.stderr.trim().slice(-400)}`);
    }
    return { ...result, notes: [...new Set(notes)], transcripts };
  } finally {
    fs.rmSync(tmpFile, { force: true });
  }
}

/** Quantas vezes retomar uma conversa do agy encerrada por ação negada. */
export const AGY_MAX_RESUMES = Number(process.env.AGENT_AGY_MAX_RESUMES ?? 3);

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
  // node_modules (symlinks) e as pastas internas do servidor nunca contam como mudança do worker.
  const internal = new Set(['node_modules', '.agent-logs', '.agent-worktrees']);
  return out.filter((p) => !p.split('/').some((seg) => internal.has(seg)));
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
