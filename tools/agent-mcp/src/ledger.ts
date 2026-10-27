/**
 * Registro de cada delegação (quem, qual modelo, quantos tokens, quanto tempo)
 * + checagem de orçamento por tarefa. Sem isso você não descobre qual agente queima dinheiro.
 */
import fs from 'node:fs';
import path from 'node:path';
import { MAX_DELEGATIONS_PER_TASK, MAX_TOKENS_PER_TASK } from './config.js';
import { logsDir } from './workspace.js';

export interface LedgerEntry {
  ts: string;
  taskId: string;
  role: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  ms: number;
  ok: boolean;
  note?: string;
}

const file = () => path.join(logsDir(), 'delegations.jsonl');

export function record(entry: LedgerEntry): void {
  fs.mkdirSync(logsDir(), { recursive: true });
  fs.appendFileSync(file(), JSON.stringify(entry) + '\n');
}

export function entries(taskId?: string): LedgerEntry[] {
  try {
    return fs
      .readFileSync(file(), 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LedgerEntry)
      .filter((e) => !taskId || e.taskId === taskId);
  } catch {
    return [];
  }
}

/** Retorna uma mensagem de bloqueio se o orçamento da tarefa acabou; senão, null. */
export function budgetBlock(taskId: string): string | null {
  const list = entries(taskId);
  const tokens = list.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0);
  if (tokens >= MAX_TOKENS_PER_TASK) {
    return `Orçamento da tarefa estourado (${tokens} de ${MAX_TOKENS_PER_TASK} tokens). Pare, resuma o estado atual ao usuário e peça decisão.`;
  }
  if (list.length >= MAX_DELEGATIONS_PER_TASK) {
    return `Limite de ${MAX_DELEGATIONS_PER_TASK} delegações por tarefa atingido. Pare, resuma o estado atual ao usuário e peça decisão.`;
  }
  return null;
}

export function report(taskId?: string): string {
  const list = entries(taskId);
  if (list.length === 0) return 'Nenhuma delegação registrada ainda.';
  const byRole = new Map<
    string,
    { calls: number; inTok: number; outTok: number; ms: number }
  >();
  for (const e of list) {
    const key = `${e.role} (${e.model})`;
    const cur = byRole.get(key) ?? { calls: 0, inTok: 0, outTok: 0, ms: 0 };
    cur.calls += 1;
    cur.inTok += e.inputTokens;
    cur.outTok += e.outputTokens;
    cur.ms += e.ms;
    byRole.set(key, cur);
  }
  const total = list.reduce((s, e) => s + e.inputTokens + e.outputTokens, 0);
  const lines = [...byRole.entries()].map(
    ([k, v]) =>
      `- ${k}: ${v.calls} chamada(s), ${v.inTok} in / ${v.outTok} out, ${(v.ms / 1000).toFixed(0)}s`,
  );
  return [
    `Tokens totais${taskId ? ` da tarefa ${taskId}` : ''}: ${total} (limite por tarefa: ${MAX_TOKENS_PER_TASK})`,
    ...lines,
    'Para custo em dinheiro, multiplique pelos preços atuais de cada modelo (não embutidos aqui de propósito).',
  ].join('\n');
}
