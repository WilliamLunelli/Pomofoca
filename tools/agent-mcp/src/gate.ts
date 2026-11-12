/**
 * Gate determinístico: typecheck, lint e testes rodados por `npm run`, sem LLM.
 * O gestor só precisa ser acionado de novo quando o gate falha.
 */
import fs from 'node:fs';
import path from 'node:path';
import { GATE_CHECKS, type GateCheck } from './config.js';
import { extractFailures } from './compress.js';
import { recordGate } from './ledger.js';
import { logsDir, resolveInside, run } from './workspace.js';

export interface CheckResult {
  name: string;
  status: 'pass' | 'fail' | 'skipped';
  ms: number;
  detail: string;
}

function hasScript(cwd: string, script: string): boolean {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    return Boolean(pkg.scripts?.[script]);
  } catch {
    return false;
  }
}

export const logPath = (taskId: string, checkName: string) =>
  path.join(logsDir(), taskId, `${checkName.replace(/[^\w-]/g, '_')}.log`);

export async function runCheck(
  taskId: string,
  worktree: string,
  check: GateCheck,
  extraArgs: string[] = [],
): Promise<CheckResult> {
  const cwd = resolveInside(worktree, check.cwd);
  if (!hasScript(cwd, check.script)) {
    return {
      name: check.name,
      status: 'skipped',
      ms: 0,
      detail: `script "${check.script}" ausente em ${check.cwd}/package.json`,
    };
  }
  const started = Date.now();
  const args = [
    'run',
    '-s',
    check.script,
    ...(extraArgs.length ? ['--', ...extraArgs] : []),
  ];
  const r = await run('npm', args, { cwd, timeoutMs: 5 * 60_000 });
  const ms = Date.now() - started;

  const full = `$ npm ${args.join(' ')}\n${r.stdout}\n${r.stderr}`;
  fs.mkdirSync(path.dirname(logPath(taskId, check.name)), { recursive: true });
  fs.writeFileSync(logPath(taskId, check.name), full);

  if (r.code === 0) return { name: check.name, status: 'pass', ms, detail: '' };
  return {
    name: check.name,
    status: 'fail',
    ms,
    detail: r.timedOut ? 'TIMEOUT (5 min)' : extractFailures(full),
  };
}

export function formatResults(results: CheckResult[]): string {
  const failed = results.some((r) => r.status === 'fail');
  const lines = [`GATE: ${failed ? 'FALHOU' : 'OK'}`];
  for (const r of results) {
    lines.push(
      `- ${r.name}: ${r.status}${r.ms ? ` (${(r.ms / 1000).toFixed(1)}s)` : ''}${r.status === 'skipped' ? ` — ${r.detail}` : ''}`,
    );
    if (r.status === 'fail' && r.detail) lines.push(r.detail.replace(/^/gm, '    '));
  }
  return lines.join('\n');
}

export async function runGate(
  taskId: string,
  worktree: string,
  only?: string[],
): Promise<string> {
  const checks = GATE_CHECKS.filter((c) => !only || only.includes(c.name));
  if (checks.length === 0)
    return (
      'Nenhum check corresponde ao filtro. Disponíveis: ' +
      GATE_CHECKS.map((c) => c.name).join(', ')
    );
  const results: CheckResult[] = [];
  for (const c of checks) results.push(await runCheck(taskId, worktree, c));
  recordGate(
    taskId,
    results.map(({ name, status, ms }) => ({ name, status, ms })),
  );
  return formatResults(results);
}
