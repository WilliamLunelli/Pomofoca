import { redis } from '../config/redis';

export type TimerMode = 'FOCUS' | 'SHORT_BREAK' | 'LONG_BREAK';
export type TimerStatus = 'running' | 'paused';

export interface ActiveTimerState {
  subjectId: string | null;
  mode: TimerMode;
  cycle: number;
  remainingSeconds: number;
  totalSeconds: number;
  status: TimerStatus;
  updatedAt: string;
  // Inicio do ciclo atual (preservado atraves de pause/resume, so reseta em
  // timer:start) - gerido pelo servidor, nunca confiado do payload do cliente.
  // E o que permite ao job de finalizacao autoritativa (jobs/queues/timerCompletion)
  // gravar startedAt/durationSeconds corretos mesmo se nenhum dispositivo estiver
  // conectado no momento em que o ciclo deveria terminar.
  startedAt: string;
}

const TTL_SECONDS = 4 * 60 * 60; // 4h - evita lixo acumulado se o usuario nunca finaliza

function key(userId: string): string {
  return `active_timer:${userId}`;
}

export async function getActiveTimer(userId: string): Promise<ActiveTimerState | null> {
  const raw = await redis.get(key(userId));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ActiveTimerState;
  } catch {
    return null;
  }
}

export async function setActiveTimer(
  userId: string,
  state: Omit<ActiveTimerState, 'updatedAt'>,
): Promise<ActiveTimerState> {
  const withTimestamp: ActiveTimerState = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  await redis.set(key(userId), JSON.stringify(withTimestamp), 'EX', TTL_SECONDS);
  return withTimestamp;
}

export async function clearActiveTimer(userId: string): Promise<void> {
  await redis.del(key(userId));
}
