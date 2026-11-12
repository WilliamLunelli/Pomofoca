#!/usr/bin/env node
// Painel local AO VIVO do pomofoca-agents: mostra a hierarquia (gestor → workers), cada tarefa,
// cada delegação (instrução enviada pelo gestor, relatório devolvido, tokens, tempo), os
// comandos que os workers do agy rodaram/tiveram negados e o histórico do gate.
//
// Só LÊ .agent-logs/ (nunca o código nem .env) e só escuta em 127.0.0.1.
// Uso: npm run painel   (ou: node scripts/painel.mjs)  →  http://127.0.0.1:4777
//      PAINEL_PORT=5000 npm run painel
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const PORT = Number(process.env.PAINEL_PORT ?? 4777);
const root = (() => {
  const cwd = process.env.AGENT_REPO_ROOT ?? process.cwd();
  return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' }).trim();
})();
const logs = path.join(root, '.agent-logs');

const mode = (process.env.AGENT_PROVIDER_MODE?.trim().toLowerCase() || 'cli') === 'api' ? 'api' : 'cli';
// Espelha src/config.ts: orçamento = entrada nova + saída + cache × CACHE_WEIGHT.
const CACHE_WEIGHT = Math.max(0, Number(process.env.AGENT_CACHE_WEIGHT ?? 0.1));
const fresh = (d) => (d.inputTokens || 0) + (d.outputTokens || 0);
const cacheOf = (d) => d.cacheReadTokens || 0;
const counted = (d) => fresh(d) + Math.round(cacheOf(d) * CACHE_WEIGHT);
const TOKEN_LIMIT = Number(process.env.AGENT_MAX_TOKENS_PER_TASK ?? (mode === 'cli' ? 4_000_000 : 600_000));
const DELEGATION_LIMIT = Number(process.env.AGENT_MAX_DELEGATIONS_PER_TASK ?? 14);

// Papéis na ordem do fluxo (espelha src/config.ts e src/server.ts).
const ROLES = [
  { role: 'explorador', tool: 'explorar', what: 'mapeia o código (só lê)' },
  { role: 'programador', tool: 'codar', what: 'implementa (não mexe em testes)' },
  { role: 'testador', tool: 'testar', what: 'escreve e roda testes' },
  { role: 'triagem', tool: 'triar_falhas', what: 'classifica falha do gate' },
  { role: 'revisor', tool: 'revisar', what: 'revisa o diff (só lê)' },
  { role: 'seguranca', tool: 'auditar_seguranca', what: 'audita segurança (só lê)' },
  { role: 'documentacao', tool: 'documentar', what: 'atualiza .md/docs' },
];

// ------------------------------------------------------------------ leitura dos logs

const readJsonl = (file) => {
  try {
    return fs
      .readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .filter((l) => l.trim().startsWith('{'))
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
};
const listDir = (dir) => {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
};

/** Resume a transcrição stream-json do agy em passos legíveis. */
function transcriptSteps(rel) {
  const abs = path.resolve(logs, rel);
  // Só arquivos .jsonl dentro de .agent-logs/agy/.
  if (!abs.startsWith(path.join(logs, 'agy') + path.sep) || !abs.endsWith('.jsonl')) return null;
  const steps = [];
  let result = null;
  for (const ev of readJsonl(abs)) {
    if (ev.event === 'result') result = ev.result;
    if (ev.event !== 'step_update') continue;
    const s = ev.step_update ?? {};
    if (s.step_type !== 'tool') continue;
    const params = s.tool_info?.parameters ?? {};
    const detail =
      params.CommandLine ??
      params.AbsolutePath ??
      params.TargetFile ??
      params.DirectoryPath ??
      params.SearchPath ??
      params.Query ??
      Object.values(params).find((v) => typeof v === 'string') ??
      '';
    const key = `${s.step_index}`;
    const prev = steps.find((x) => x.key === key);
    const item = {
      key,
      tool: s.tool_name,
      // Caminho absoluto do worktree → relativo ao projeto (mais legível).
      detail: String(detail)
        .replace(/\\/g, '/')
        .replace(/^.*?-agent-worktrees\/[^/]+\//, '')
        .slice(0, 300),
      state: s.state,
      error: s.tool_info?.error?.message?.split('\n')[0]?.slice(0, 200) ?? '',
    };
    if (prev) Object.assign(prev, item);
    else steps.push(item);
  }
  return { steps, done: Boolean(result), status: result?.status ?? null };
}

function state() {
  const delegations = readJsonl(path.join(logs, 'delegations.jsonl'));
  const reports = new Map(readJsonl(path.join(logs, 'reports.jsonl')).map((r) => [r.id, r.report]));
  const gates = readJsonl(path.join(logs, 'gates.jsonl'));
  const running = listDir(path.join(logs, 'running'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(logs, 'running', f)))
    .filter(Boolean);

  const budgets = readJson(path.join(logs, 'budgets.json')) ?? {};
  const tasks = listDir(path.join(logs, 'tasks'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson(path.join(logs, 'tasks', f)))
    .filter(Boolean);
  const ids = new Set([...tasks.map((t) => t.id), ...delegations.map((d) => d.taskId)]);

  // Delegações anteriores ao painel não guardavam a transcrição: liga pelo nome do arquivo antigo
  // (`agy/<papel>-<pid>-<início em ms>.<n>.jsonl`) com o início da delegação (ts - ms).
  const legacy = listDir(path.join(logs, 'agy'))
    .map((f) => /^([a-z]+)-\d+-(\d+)\.(\d+)\.jsonl$/.exec(f))
    .filter(Boolean)
    .map((m) => ({ file: `agy/${m[0]}`, role: m[1], start: Number(m[2]) }));
  const legacyFor = (d) => {
    if (d.transcripts || !String(d.model).startsWith('agy:')) return d.transcripts ?? [];
    const start = new Date(d.ts).getTime() - (d.ms || 0);
    return legacy
      .filter((l) => l.role === d.role && Math.abs(l.start - start) < 15_000)
      .map((l) => l.file)
      .sort();
  };

  const byTask = [...ids].map((id) => {
    const meta = tasks.find((t) => t.id === id) ?? { id };
    const ds = delegations
      .filter((d) => d.taskId === id)
      .map((d) => ({ ...d, transcripts: legacyFor(d), report: d.id ? reports.get(d.id) ?? null : null }));
    const tokens = ds.reduce((s, d) => s + counted(d), 0);
    const freshTokens = ds.reduce((s, d) => s + fresh(d), 0);
    const cacheTokens = ds.reduce((s, d) => s + cacheOf(d), 0);
    return {
      id,
      branch: meta.branch ?? null,
      base: meta.base ?? null,
      dir: meta.dir ?? null,
      createdAt: meta.createdAt ?? ds[0]?.ts ?? null,
      closed: Boolean(meta.closed),
      tokens,
      freshTokens,
      cacheTokens,
      tokenLimit: Number(budgets[id]) > 0 ? Number(budgets[id]) : TOKEN_LIMIT,
      delegations: ds,
      gates: gates.filter((g) => g.taskId === id),
      running: running.filter((r) => r.taskId === id),
    };
  });
  byTask.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));

  const roles = ROLES.map((r) => {
    const ds = delegations.filter((d) => d.role === r.role);
    return {
      ...r,
      model: running.find((x) => x.role === r.role)?.model ?? ds.at(-1)?.model ?? null,
      calls: ds.length,
      failures: ds.filter((d) => !d.ok).length,
      tokens: ds.reduce((s, d) => s + fresh(d), 0),
      cache: ds.reduce((s, d) => s + cacheOf(d), 0),
      ms: ds.reduce((s, d) => s + (d.ms || 0), 0),
      running: running.some((x) => x.role === r.role),
    };
  });

  return {
    now: new Date().toISOString(),
    repo: root,
    mode,
    limits: { tokens: TOKEN_LIMIT, delegations: DELEGATION_LIMIT, cacheWeight: CACHE_WEIGHT },
    roles,
    tasks: byTask,
    running,
  };
}

// ------------------------------------------------------------------ HTTP

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  const send = (code, type, body) => {
    res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  };
  try {
    if (url.pathname === '/api/state') return send(200, 'application/json', JSON.stringify(state()));
    if (url.pathname === '/api/transcript') {
      const t = transcriptSteps(url.searchParams.get('path') ?? '');
      return t ? send(200, 'application/json', JSON.stringify(t)) : send(400, 'text/plain', 'caminho inválido');
    }
    if (url.pathname === '/') return send(200, 'text/html; charset=utf-8', PAGE);
    return send(404, 'text/plain', 'não encontrado');
  } catch (e) {
    return send(500, 'text/plain', String(e?.message ?? e));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Painel do pomofoca-agents: http://127.0.0.1:${PORT}  (lendo ${logs})`);
});

// ------------------------------------------------------------------ página

const PAGE = /* html */ `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Painel dos agentes</title>
<style>
  :root {
    --bg: #f6f5f2; --panel: #ffffff; --ink: #1d1c1a; --muted: #6b6862; --line: #e4e1da;
    --claude: #c96442; --claude-tint: #f7e9e3; --gemini: #3b6fd8; --gemini-tint: #e6eefc;
    --ok: #2f7d4f; --ok-tint: #e3f2e8; --fail: #b4402f; --fail-tint: #f8e4e0;
    --run: #a26a00; --run-tint: #fbf0d9; --code: #f1efea;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #161513; --panel: #1f1e1b; --ink: #ecebe7; --muted: #a29f97; --line: #34322e;
      --claude: #e08a6b; --claude-tint: #3a2a23; --gemini: #7ea3ee; --gemini-tint: #22304a;
      --ok: #6cc28f; --ok-tint: #1f3327; --fail: #ee8a7b; --fail-tint: #3d2420;
      --run: #e3b04b; --run-tint: #3a2f17; --code: #262521;
    }
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink);
    font: 14px/1.45 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { display: flex; align-items: center; gap: 12px; padding: 14px 20px;
    border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 2; }
  header h1 { font-size: 16px; margin: 0; font-weight: 650; }
  header .sub { color: var(--muted); font-size: 12px; }
  .live { margin-left: auto; display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 12px; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--muted); display: inline-block; }
  .dot.on { background: var(--run); animation: pulse 1.2s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: .35; transform: scale(.8); } }
  main { max-width: 1200px; margin: 0 auto; padding: 20px; display: grid; gap: 20px; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 0 0 10px; font-weight: 600; }
  .card { background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 14px; }

  /* hierarquia */
  .tree { display: grid; gap: 14px; }
  .gestor { display: flex; align-items: center; gap: 12px; border-left: 4px solid var(--claude); }
  .gestor b { font-size: 15px; }
  .workers { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; position: relative; }
  .worker { border-left: 4px solid var(--line); display: grid; gap: 4px; }
  .worker.claude { border-left-color: var(--claude); }
  .worker.gemini { border-left-color: var(--gemini); }
  .worker.running { box-shadow: 0 0 0 2px var(--run); }
  .worker .top { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
  .worker .name { font-weight: 650; text-transform: capitalize; }
  .worker .what { color: var(--muted); font-size: 12px; }
  .worker .stats { font-size: 12px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .badge { font-size: 11px; padding: 2px 7px; border-radius: 999px; white-space: nowrap; font-weight: 600; }
  .badge.claude { background: var(--claude-tint); color: var(--claude); }
  .badge.gemini { background: var(--gemini-tint); color: var(--gemini); }
  .badge.none { background: var(--code); color: var(--muted); }
  .badge.ok { background: var(--ok-tint); color: var(--ok); }
  .badge.fail { background: var(--fail-tint); color: var(--fail); }
  .badge.run { background: var(--run-tint); color: var(--run); }
  .arrow { color: var(--muted); font-size: 12px; padding-left: 4px; }

  /* tarefas */
  .tabs { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
  .tab { border: 1px solid var(--line); background: var(--panel); color: var(--ink); border-radius: 999px;
    padding: 6px 12px; cursor: pointer; font: inherit; display: flex; gap: 6px; align-items: center; }
  .tab[aria-selected="true"] { border-color: var(--ink); font-weight: 600; }
  .taskhead { display: grid; gap: 10px; grid-template-columns: 1fr; }
  @media (min-width: 760px) { .taskhead { grid-template-columns: 2fr 1fr 1fr; } }
  .kv { font-size: 12px; color: var(--muted); }
  .kv code { color: var(--ink); }
  .bar { height: 8px; background: var(--code); border-radius: 999px; overflow: hidden; margin-top: 6px; }
  .bar > span { display: block; height: 100%; background: var(--ok); }
  .bar.warn > span { background: var(--run); } .bar.over > span { background: var(--fail); }
  .gates { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }

  .timeline { display: grid; gap: 10px; margin-top: 14px; }
  .ev { display: grid; grid-template-columns: 74px 1fr; gap: 12px; }
  .ev .when { color: var(--muted); font-size: 12px; text-align: right; padding-top: 14px; font-variant-numeric: tabular-nums; }
  .ev .body { border-left: 4px solid var(--line); }
  .ev.claude .body { border-left-color: var(--claude); }
  .ev.gemini .body { border-left-color: var(--gemini); }
  .ev.gate .body { border-left-color: var(--muted); }
  .ev.running .body { box-shadow: 0 0 0 2px var(--run); }
  .row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
  .row .role { font-weight: 650; text-transform: capitalize; }
  .row .meta { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
  details { margin-top: 8px; }
  summary { cursor: pointer; color: var(--muted); font-size: 12px; user-select: none; }
  summary:hover { color: var(--ink); }
  pre { background: var(--code); border-radius: 8px; padding: 10px; margin: 6px 0 0; white-space: pre-wrap;
    word-break: break-word; font: 12px/1.5 ui-monospace, SFMono-Regular, Consolas, monospace; max-height: 420px; overflow: auto; }
  .steps { display: grid; gap: 4px; margin-top: 6px; }
  .step { display: grid; grid-template-columns: 16px 130px 1fr; gap: 6px; font: 12px/1.4 ui-monospace, Consolas, monospace; align-items: start; }
  .step .s { width: 8px; height: 8px; border-radius: 50%; margin-top: 4px; background: var(--muted); }
  .step.DONE .s { background: var(--ok); } .step.ERROR .s { background: var(--fail); }
  .step.ACTIVE .s { background: var(--run); animation: pulse 1.2s infinite; }
  .step .t { color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
  .step .d { word-break: break-word; } .step .e { color: var(--fail); grid-column: 3; }
  .empty { color: var(--muted); padding: 30px; text-align: center; }
  .legend { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12px; color: var(--muted); }
</style>
</head>
<body>
<header>
  <div>
    <h1>Painel dos agentes · pomofoca-agents</h1>
    <div class="sub" id="sub"></div>
  </div>
  <div class="live"><span class="dot" id="livedot"></span><span id="livetxt">conectando…</span></div>
</header>
<main>
  <section>
    <h2>Hierarquia</h2>
    <div class="tree">
      <div class="card gestor">
        <div>
          <b>Gestor</b> <span class="badge claude">Claude Opus · sessão do Claude Code</span>
          <div class="what" style="color:var(--muted);font-size:12px">planeja, delega pelas ferramentas MCP, decide; não escreve código de produto</div>
        </div>
      </div>
      <div class="arrow">↓ delega via MCP (cada worker roda no worktree da tarefa)</div>
      <div class="workers" id="workers"></div>
      <div class="legend">
        <span><span class="badge claude">Claude</span> via <code>claude -p</code> (assinatura Pro)</span>
        <span><span class="badge gemini">Gemini</span> via <code>agy</code> (conta Google)</span>
        <span><span class="badge run">em andamento</span></span>
      </div>
    </div>
  </section>
  <section>
    <h2>Tarefas</h2>
    <div class="tabs" id="tabs"></div>
    <div id="task"></div>
  </section>
</main>
<script>
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fam = (model) => !model ? 'none' : model.startsWith('claude') || model.startsWith('anthropic') ? 'claude' : 'gemini';
const famName = (model) => ({ claude: 'Claude', gemini: 'Gemini', none: '—' })[fam(model)];
const fmtTok = (n) => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(n || 0);
const fmtMs = (ms) => { const s = Math.round((ms || 0) / 1000); return s >= 60 ? Math.floor(s / 60) + 'min ' + (s % 60) + 's' : s + 's'; };
const fmtTime = (iso) => iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
const ROLE_TOOL = {};
let selected = null;
let lastKey = '';
const open = new Set();           // <details> abertos (persistem entre atualizações)
const transcripts = new Map();    // caminho → passos carregados

function workerCard(r) {
  const f = fam(r.model);
  return '<div class="card worker ' + f + (r.running ? ' running' : '') + '">' +
    '<div class="top"><span class="name">' + esc(r.role) + '</span>' +
    (r.running ? '<span class="badge run">rodando</span>' : '<span class="badge ' + f + '">' + esc(r.model ? r.model.replace(/^(agy|claude-cli|anthropic|google):/, '') : 'ainda não usado') + '</span>') + '</div>' +
    '<div class="what"><code>' + esc(r.tool) + '</code> · ' + esc(r.what) + '</div>' +
    '<div class="stats">' + r.calls + ' chamada(s)' + (r.failures ? ' · ' + r.failures + ' falha(s)' : '') + ' · ' + fmtTok(r.tokens) + ' novos' + (r.cache ? ' + ' + fmtTok(r.cache) + ' cache' : '') + ' · ' + fmtMs(r.ms) + '</div></div>';
}

function stepsHtml(t) {
  if (!t) return '<div class="meta">carregando…</div>';
  if (!t.steps.length) return '<div class="meta">nenhuma ferramenta usada ainda</div>';
  return '<div class="steps">' + t.steps.map((s) =>
    '<div class="step ' + esc(s.state) + '"><span class="s"></span><span class="t">' + esc(s.tool) + '</span><span class="d">' + esc(s.detail) + '</span>' +
    (s.error ? '<span class="e">' + esc(s.error) + '</span>' : '') + '</div>').join('') + '</div>';
}

function det(key, label, inner) {
  return '<details data-key="' + esc(key) + '"' + (open.has(key) ? ' open' : '') + '><summary>' + label + '</summary>' + inner + '</details>';
}

function delegationEv(d) {
  const f = fam(d.model);
  const tok = (d.inputTokens || 0) + (d.outputTokens || 0);
  const cache = d.cacheReadTokens;
  // Entradas antigas (sem cacheReadTokens) do agy/claude-cli somavam o cache na entrada.
  const tokLabel = cache === undefined && /^(agy|claude-cli):/.test(String(d.model))
    ? fmtTok(tok) + ' tokens (com cache, registro antigo)'
    : fmtTok(tok) + ' novos' + (cache ? ' + ' + fmtTok(cache) + ' cache' : '');
  let html = '<div class="ev ' + f + '"><div class="when">' + fmtTime(d.ts) + '</div><div class="card body">' +
    '<div class="row"><span class="role">' + esc(d.role) + '</span><span class="badge ' + f + '">' + esc(famName(d.model)) + ' · ' + esc(String(d.model).replace(/^(agy|claude-cli):/, '')) + '</span>' +
    '<span class="badge ' + (d.ok ? 'ok' : 'fail') + '">' + (d.ok ? 'ok' : 'falhou') + '</span>' +
    '<span class="meta">' + fmtMs(d.ms) + ' · ' + tokLabel + '</span></div>';
  if (d.note) html += '<div class="meta" style="margin-top:6px;color:var(--fail)">' + esc(d.note) + '</div>';
  const id = d.id || d.ts + d.role;
  html += d.instruction ? det(id + ':in', '→ instrução do gestor', '<pre>' + esc(d.instruction) + '</pre>') : '<div class="meta" style="margin-top:6px">(delegação anterior ao painel: instrução não registrada)</div>';
  if (d.report) html += det(id + ':out', '← relatório devolvido ao gestor', '<pre>' + esc(d.report) + '</pre>');
  for (const p of d.transcripts || []) html += det('t:' + p, '⋯ passos do agy (' + esc(p.split('/').pop()) + ')', stepsHtml(transcripts.get(p)));
  return html + '</div></div>';
}

function runningEv(r) {
  const f = fam(r.model);
  const el = Date.now() - new Date(r.startedAt).getTime();
  let html = '<div class="ev ' + f + ' running"><div class="when">' + fmtTime(r.startedAt) + '</div><div class="card body">' +
    '<div class="row"><span class="role">' + esc(r.role) + '</span><span class="badge ' + f + '">' + esc(famName(r.model)) + ' · ' + esc(String(r.model).replace(/^(agy|claude-cli):/, '')) + '</span>' +
    '<span class="badge run"><span class="dot on"></span> rodando há ' + fmtMs(el) + '</span></div>' +
    det(r.id + ':in', '→ instrução do gestor', '<pre>' + esc(r.instruction) + '</pre>');
  if (r.transcriptBase) {
    for (const p of [0, 1, 2, 3].map((n) => r.transcriptBase + '.' + n + '.jsonl').filter((p) => transcripts.has(p) || p.endsWith('.0.jsonl')))
      html += '<div style="margin-top:8px"><div class="meta">passos ao vivo</div>' + stepsHtml(transcripts.get(p)) + '</div>';
  } else {
    html += '<div class="meta" style="margin-top:8px">o Claude CLI não transmite passos; o relatório aparece ao terminar</div>';
  }
  return html + '</div></div>';
}

function gateEv(g) {
  const failed = g.results.some((r) => r.status === 'fail');
  return '<div class="ev gate"><div class="when">' + fmtTime(g.ts) + '</div><div class="card body"><div class="row"><span class="role">gate</span>' +
    '<span class="badge ' + (failed ? 'fail' : 'ok') + '">' + (failed ? 'FALHOU' : 'OK') + '</span><span class="meta">sem LLM</span></div>' +
    '<div class="gates">' + g.results.map((r) => '<span class="badge ' + (r.status === 'pass' ? 'ok' : r.status === 'fail' ? 'fail' : 'none') + '">' + esc(r.name) + ' · ' + esc(r.status) + ' · ' + fmtMs(r.ms) + '</span>').join('') + '</div></div></div>';
}

function renderTask(t, limits) {
  if (!t) return '<div class="card empty">Nenhuma tarefa ainda. Ela aparece aqui assim que o gestor chamar <code>tarefa_abrir</code>.</div>';
  const pct = Math.min(100, (t.tokens / t.tokenLimit) * 100);
  const lastGate = t.gates.at(-1);
  let html = '<div class="card taskhead">' +
    '<div><div class="row"><b>' + esc(t.id) + '</b>' + (t.closed ? '<span class="badge none">encerrada</span>' : t.running.length ? '<span class="badge run">em andamento</span>' : '<span class="badge ok">aberta</span>') + '</div>' +
    '<div class="kv">branch <code>' + esc(t.branch || '—') + '</code> · base <code>' + esc((t.base || '').slice(0, 8)) + '</code></div>' +
    '<div class="kv">worktree <code>' + esc(t.dir || '—') + '</code></div></div>' +
    '<div><div class="kv">orçamento: <code>' + fmtTok(t.tokens) + '</code> de ' + fmtTok(t.tokenLimit) + (t.tokenLimit !== limits.tokens ? ' (liberado pelo usuário)' : '') + '</div><div class="kv">' + fmtTok(t.freshTokens) + ' novos + ' + fmtTok(t.cacheTokens) + ' cache (conta × ' + limits.cacheWeight + ')</div><div class="bar ' + (pct >= 100 ? 'over' : pct >= 80 ? 'warn' : '') + '"><span style="width:' + pct + '%"></span></div>' +
    '<div class="kv" style="margin-top:6px">delegações: <code>' + t.delegations.length + '</code> de ' + limits.delegations + '</div></div>' +
    '<div><div class="kv">último gate</div><div class="gates">' + (lastGate ? lastGate.results.map((r) => '<span class="badge ' + (r.status === 'pass' ? 'ok' : r.status === 'fail' ? 'fail' : 'none') + '">' + esc(r.name) + '</span>').join('') : '<span class="badge none">ainda não rodou</span>') + '</div></div>' +
    '</div>';
  const evs = [
    ...t.delegations.map((d) => ({ at: new Date(new Date(d.ts).getTime() - (d.ms || 0)).toISOString(), html: delegationEv(d) })),
    ...t.gates.map((g) => ({ at: g.ts, html: gateEv(g) })),
    ...t.running.map((r) => ({ at: r.startedAt, html: runningEv(r) })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  html += '<div class="timeline">' + (evs.length ? evs.map((e) => e.html).join('') : '<div class="card empty">sem eventos ainda</div>') + '</div>';
  return html;
}

async function loadTranscripts(s) {
  const want = new Set();
  for (const t of s.tasks) {
    for (const d of t.delegations) for (const p of d.transcripts || []) if (open.has('t:' + p)) want.add(p);
    for (const r of t.running) if (r.transcriptBase) for (const n of [0, 1, 2, 3]) want.add(r.transcriptBase + '.' + n + '.jsonl');
  }
  await Promise.all([...want].map(async (p) => {
    try {
      const res = await fetch('/api/transcript?path=' + encodeURIComponent(p));
      if (res.ok) { const j = await res.json(); if (j.steps.length || p.endsWith('.0.jsonl')) transcripts.set(p, j); }
    } catch {}
  }));
}

async function tick() {
  try {
    const s = await (await fetch('/api/state')).json();
    await loadTranscripts(s);
    $('sub').textContent = s.repo + ' · modo ' + s.mode;
    $('livedot').className = 'dot' + (s.running.length ? ' on' : '');
    $('livetxt').textContent = (s.running.length ? s.running.length + ' worker(s) rodando · ' : 'ocioso · ') + 'atualizado ' + fmtTime(s.now);
    if (!selected || !s.tasks.some((t) => t.id === selected)) selected = s.tasks[0]?.id ?? null;
    // Só redesenha se algo mudou (ou se há worker rodando, para o cronômetro andar): assim os
    // cliques não "somem" no meio de uma atualização.
    const key = JSON.stringify([s.roles, s.tasks, selected, [...open], [...transcripts]]);
    if (key === lastKey && !s.running.length) return;
    lastKey = key;
    $('workers').innerHTML = s.roles.map(workerCard).join('');
    $('tabs').innerHTML = s.tasks.map((t) => '<button class="tab" role="tab" aria-selected="' + (t.id === selected) + '" data-id="' + esc(t.id) + '">' +
      (t.running.length ? '<span class="dot on"></span>' : '') + esc(t.id) + '</button>').join('');
    const y = window.scrollY;
    $('task').innerHTML = renderTask(s.tasks.find((t) => t.id === selected), s.limits);
    window.scrollTo(0, y);
  } catch (e) {
    $('livetxt').textContent = 'sem conexão com o painel (o servidor parou?)';
    $('livedot').className = 'dot';
  }
}

document.addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) { selected = tab.dataset.id; tick(); }
});
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!(d instanceof HTMLDetailsElement) || !d.dataset.key) return;
  if (d.open) { open.add(d.dataset.key); if (d.dataset.key.startsWith('t:')) tick(); } else open.delete(d.dataset.key);
}, true);
tick();
setInterval(tick, 2000);
</script>
</body>
</html>`;
