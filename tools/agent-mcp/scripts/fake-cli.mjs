// CLI simulado (claude/gemini) para scripts/cli.mjs. Não chama nenhum modelo.
// Comportamento controlado por env:
//   FAKE_CLI_LOG    arquivo onde grava { argv, stdin, system, env } da chamada
//   FAKE_CLI_WRITES JSON { "caminho/relativo": "conteúdo" } — arquivos que o "modelo" escreve
//   FAKE_CLI_MODE   "ok" (padrão) | "auth-error" | "garbage"
import fs from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const kind = argv.includes('--append-system-prompt-file') ? 'claude' : 'gemini';
const stdin = fs.readFileSync(0, 'utf8');
const sysIdx = argv.indexOf('--append-system-prompt-file');
const system = sysIdx >= 0 ? fs.readFileSync(argv[sysIdx + 1], 'utf8') : '';

if (process.env.FAKE_CLI_LOG) {
  fs.writeFileSync(
    process.env.FAKE_CLI_LOG,
    JSON.stringify({
      kind,
      argv,
      stdin,
      system,
      cwd: process.cwd(),
      env: {
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY ?? null,
        GEMINI_API_KEY: process.env.GEMINI_API_KEY ?? null,
        CLAUDECODE: process.env.CLAUDECODE ?? null,
      },
    }),
  );
}

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
  const out =
    mode === 'auth-error'
      ? { error: { type: 'Error', message: 'Please set an Auth method (login required)' } }
      : {
          response: report,
          stats: {
            models: { 'gemini-x': { api: { totalRequests: 4 }, tokens: { prompt: 2000, candidates: 70, thoughts: 30 } } },
            tools: { totalCalls: 3 },
          },
        };
  // Como o Gemini CLI real: o JSON de erro sai no stderr, com código 41.
  if (out.error) {
    process.stderr.write(JSON.stringify(out, null, 2));
    process.exit(41);
  }
  process.stdout.write(JSON.stringify(out, null, 2));
}
