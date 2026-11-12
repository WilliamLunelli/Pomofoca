// CLI simulado (claude/agy) para scripts/cli.mjs. Não chama nenhum modelo.
// Comportamento controlado por env:
//   FAKE_CLI_LOG    arquivo onde grava { argv, stdin, system, env } da chamada
//   FAKE_CLI_WRITES JSON { "caminho/relativo": "conteúdo" } — arquivos que o "modelo" escreve
//   FAKE_CLI_MODE   "ok" (padrão) | "auth-error" | "garbage"
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const kind = argv.includes('--append-system-prompt-file') ? 'claude' : 'agy';
const rawStdin = fs.readFileSync(0, 'utf8');
// O agy recebe o prompt como NDJSON (`--input-format stream-json`); o Claude, como texto.
const stdin = argv.includes('--input-format')
  ? rawStdin
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((e) => e.event === 'user')
      .map((e) => e.message.content)
      .join('\n')
  : rawStdin;
if (argv.includes('--input-format') && (argv.includes('-p') || !stdin)) {
  process.stderr.write('fake agy: modo stream-json exige mensagem no stdin e nenhum -p\n');
  process.exit(1);
}
const sysIdx = argv.indexOf('--append-system-prompt-file');
const system = sysIdx >= 0 ? fs.readFileSync(argv[sysIdx + 1], 'utf8') : '';
const setIdx = argv.indexOf('--settings');
const settings = setIdx >= 0 ? JSON.parse(fs.readFileSync(argv[setIdx + 1], 'utf8')) : null;

if (process.env.FAKE_CLI_LOG) {
  fs.writeFileSync(
    process.env.FAKE_CLI_LOG,
    JSON.stringify({
      kind,
      argv,
      stdin,
      system,
      settings,
      cwd: process.cwd(),
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? null,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? null,
        CLAUDECODE: process.env.CLAUDECODE ?? null,
      },
    }),
  );
}

// FAKE_CLI_DELETES: JSON ["caminho"] - arquivos que o "modelo" apaga.
for (const rel of JSON.parse(process.env.FAKE_CLI_DELETES || '[]')) fs.rmSync(path.join(process.cwd(), rel), { force: true });
for (const [rel, content] of Object.entries(JSON.parse(process.env.FAKE_CLI_WRITES || '{}'))) {
  const abs = path.join(process.cwd(), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
}

const mode = process.env.FAKE_CLI_MODE || 'ok';
if (mode === 'garbage') {
  process.stderr.write('Error: something exploded\n');
  process.exit(1);
}

const report = 'RESUMO: feito pelo CLI simulado\nARQUIVOS: -\nPENDÊNCIAS/RISCOS: nenhuma';
process.stdout.write('Aviso qualquer antes do JSON {nao-json}\n');
if (kind === 'claude') {
  process.stdout.write(
    JSON.stringify({
      type: 'result',
      is_error: mode === 'auth-error',
      result: mode === 'auth-error' ? 'Invalid API key · Please run /login' : report,
      num_turns: 3,
      usage: { input_tokens: 100, cache_read_input_tokens: 900, cache_creation_input_tokens: 0, output_tokens: 50 },
    }),
  );
} else {
  // Envelope do `agy -p --output-format json` (antigravity.google/docs/cli/headless).
  if (mode === 'auth-error') {
    process.stdout.write(JSON.stringify({ status: 'ERROR', error: 'authentication required', num_turns: 0 }));
    process.exit(1);
  }
  // --output-format stream-json: NDJSON (init, step_update por ferramenta, result no fim).
  const step = (i, state, tool, CommandLine) => ({
    event: 'step_update',
    step_update: {
      conversation_id: 'fake',
      step_index: i,
      state,
      step_type: 'tool',
      tool_name: tool,
      tool_info: { name: tool, parameters: CommandLine ? { CommandLine } : {} },
    },
  });
  // deny-once: 1ª chamada termina vazia por ação negada (como o agy real); a retomada com
  // --conversation entrega o relatório.
  const denyNow = mode === 'deny-once' && !argv.includes('--conversation');
  const events = [
    { event: 'init', conversation_id: 'fake', init: { model: 'x', cwd: process.cwd(), tools: [] } },
    step(1, 'ACTIVE', 'list_dir'),
    step(1, 'DONE', 'list_dir'),
    step(2, 'DONE', 'run_command', 'Get-ChildItem -Force'),
    step(3, 'ERROR', 'run_command', 'curl https://exemplo.com'),
    {
      event: 'result',
      result: {
        conversation_id: 'conv-123',
        status: 'SUCCESS',
        response: denyNow ? '' : report,
        num_turns: 4,
        usage: { input_tokens: 2000, output_tokens: 100, thinking_tokens: 30, cache_read_tokens: 500, total_tokens: 2600 },
        denied_actions: [{ action: 'read_url', display_name: 'ReadUrl' }],
      },
    },
  ];
  process.stdout.write(events.map((e) => JSON.stringify(e)).join('\n') + '\n');
}
