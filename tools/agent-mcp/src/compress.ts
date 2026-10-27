/**
 * Compressão DETERMINÍSTICA (sem LLM) do que volta ao gestor.
 * Regra: resultado de worker nunca chega inteiro ao Opus, só o essencial.
 */
import { MAX_DIFF_CHARS } from './config.js';
import { git } from './workspace.js';

export const tail = (text: string, lines = 40): string =>
  text.split('\n').slice(-lines).join('\n');

export const clip = (text: string, max: number): string =>
  text.length <= max
    ? text
    : text.slice(0, max) + `\n… [cortado: ${text.length - max} caracteres]`;

/** Extrai o que importa de um log de falha (Jest, tsc/eslint) ou devolve o final do log. */
export function extractFailures(log: string, maxChars = 2500): string {
  const lines = log.split('\n');
  const parts: string[] = [];

  // Jest: blocos que começam com "●"
  const blocks: string[] = [];
  for (let i = 0; i < lines.length && blocks.length < 5; i++) {
    if (lines[i]?.includes('●') && !lines[i]?.includes('Console')) {
      blocks.push(lines.slice(i, i + 16).join('\n'));
    }
  }
  if (blocks.length) parts.push(...blocks);
  const summary = lines.filter((l) => /^(Tests?|Test Suites?):/.test(l.trim()));
  if (summary.length) parts.push(summary.join('\n'));

  // TypeScript
  const ts = lines.filter((l) => /error TS\d+/.test(l)).slice(0, 15);
  if (ts.length) parts.push(ts.join('\n'));

  // ESLint (formato stylish): linhas "  12:5  error  ..."
  const eslint = lines.filter((l) => /^\s+\d+:\d+\s+error\s/.test(l)).slice(0, 15);
  if (eslint.length) parts.push(eslint.join('\n'));

  const out = parts.length ? parts.join('\n---\n') : tail(log, 40);
  return clip(out, maxChars);
}

export async function diffStat(dir: string, base: string): Promise<string> {
  const r = await git(dir, [
    'diff',
    '--stat',
    base,
    'HEAD',
    '--',
    '.',
    ':(exclude)package-lock.json',
  ]);
  return r.stdout.trim() || '(sem mudanças em relação à base)';
}

export async function fullDiff(dir: string, base: string): Promise<string> {
  const r = await git(dir, [
    'diff',
    '-U3',
    base,
    'HEAD',
    '--',
    '.',
    ':(exclude)package-lock.json',
  ]);
  return clip(r.stdout, MAX_DIFF_CHARS) || '(sem mudanças em relação à base)';
}
