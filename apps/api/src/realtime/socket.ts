import type { Server as HttpServer } from 'node:http';

import { createAdapter } from '@socket.io/redis-adapter';
import { PLAN } from '@pomofoca/shared';
import { Server, type Socket } from 'socket.io';

import { env } from '../config/env';
import { logger } from '../config/logger';
import { redis } from '../config/redis';
import {
  cancelCompletion,
  scheduleCompletion,
} from '../jobs/queues/timerCompletion.queue';
import { initTimerCompletionWorker } from '../jobs/workers/timerCompletion.worker';
import { verifyAccessToken } from '../shared/utils/jwt';
import {
  clearActiveTimer,
  getActiveTimer,
  setActiveTimer,
  type ActiveTimerState,
} from './activeTimer';
import { cancelDisconnectGrace, scheduleDisconnectGrace } from './disconnectGrace';

const TIMER_EVENTS = [
  'timer:start',
  'timer:pause',
  'timer:resume',
  'timer:finish',
  'timer:subjectChange',
] as const;
type TimerEvent = (typeof TIMER_EVENTS)[number];

interface SocketData {
  userId: string;
}

function isValidPayload(body: unknown): body is Omit<ActiveTimerState, 'updatedAt'> {
  if (!body || typeof body !== 'object') return false;
  const b = body as Record<string, unknown>;
  return (
    (b.subjectId === null || typeof b.subjectId === 'string') &&
    ['FOCUS', 'SHORT_BREAK', 'LONG_BREAK'].includes(b.mode as string) &&
    typeof b.cycle === 'number' &&
    typeof b.remainingSeconds === 'number' &&
    typeof b.totalSeconds === 'number' &&
    ['running', 'paused'].includes(b.status as string)
  );
}

function userRoom(userId: string): string {
  return `user:${userId}`;
}

/**
 * Sincronizacao do timer entre dispositivos (Premium) - uma "room" Socket.io por
 * usuario. O ultimo evento recebido pelo servidor vence (last-write-wins); nao ha
 * merge, ja que e sempre o mesmo usuario em telas diferentes, nunca usuarios
 * concorrentes. O adapter Redis ja vai junto mesmo com uma unica instancia da API -
 * evita retrabalho se um dia rodar mais de um container.
 */
export function initRealtime(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: { origin: env.CORS_ORIGIN, credentials: true },
    path: '/socket.io',
  });

  const pubClient = redis.duplicate();
  const subClient = redis.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('UNAUTHORIZED'));
    try {
      const payload = verifyAccessToken(token);
      if (payload.plan === PLAN.FREE) return next(new Error('PREMIUM_FEATURE_REQUIRED'));
      (socket.data as SocketData).userId = payload.sub;
      next();
    } catch {
      next(new Error('UNAUTHORIZED'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const { userId } = socket.data as SocketData;
    socket.join(userRoom(userId));
    // Reconectou (reload de pagina, rede caiu e voltou, etc.) dentro da janela de
    // tolerancia - cancela a finalizacao antecipada agendada pra esse usuario.
    cancelDisconnectGrace(userId);

    for (const event of TIMER_EVENTS) {
      socket.on(event, (payload: unknown) =>
        handleTimerEvent(socket, userId, event, payload),
      );
    }

    socket.on('disconnect', () => {
      void handleDisconnect(io, userId);
    });
  });

  initTimerCompletionWorker(io);

  return io;
}

/**
 * Roda a cada desconexao de socket. So agenda a janela de tolerancia se essa era a
 * ULTIMA conexao do usuario (allSockets() consulta o adapter Redis, entao reflete
 * o cluster inteiro, nao so este processo) - o usuario pode ter outra aba/
 * dispositivo ainda conectado, e nesse caso nada precisa acontecer.
 */
async function handleDisconnect(io: Server, userId: string) {
  const remaining = await io.in(userRoom(userId)).allSockets();
  if (remaining.size === 0) {
    scheduleDisconnectGrace(io, userId);
  }
}

async function handleTimerEvent(
  socket: Socket,
  userId: string,
  event: TimerEvent,
  payload: unknown,
) {
  try {
    if (event === 'timer:finish') {
      // O cliente ja tratou a conclusao localmente (POST /sessions proprio) -
      // cancela o job de finalizacao autoritativa correspondente, senao ele
      // gravaria a mesma sessao de novo quando disparasse.
      await cancelCompletion(userId);
      await clearActiveTimer(userId);
    } else {
      if (!isValidPayload(payload)) return;

      // startedAt e gerido pelo servidor, nunca pelo payload do cliente - marca o
      // inicio do ciclo atual, preservado atraves de pause/resume, so reseta num
      // timer:start de verdade. E o que o job de finalizacao usa pra gravar a
      // sessao corretamente mesmo sem nenhum dispositivo conectado.
      const previous = await getActiveTimer(userId);
      const startedAt =
        event === 'timer:start'
          ? new Date().toISOString()
          : (previous?.startedAt ?? new Date().toISOString());

      await setActiveTimer(userId, { ...payload, startedAt });

      if (event === 'timer:pause') {
        await cancelCompletion(userId);
      } else if (event === 'timer:start' || event === 'timer:resume') {
        await scheduleCompletion(userId, payload.remainingSeconds);
      }
      // timer:subjectChange nao afeta o timing - nao precisa reagendar nada, o
      // job (se houver) ja vai ler o subjectId atualizado do Redis quando rodar.
    }
    // broadcast pros OUTROS dispositivos do mesmo usuario - quem emitiu ja aplicou
    // a mudanca localmente (otimista), reenviar pra ele seria redundante.
    socket.to(userRoom(userId)).emit(event, payload);
  } catch (err) {
    logger.error({ err }, `Failed to handle ${event}`);
  }
}
