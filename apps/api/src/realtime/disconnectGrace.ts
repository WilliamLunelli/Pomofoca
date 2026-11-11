import type { Server } from 'socket.io';

import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { cancelCompletion } from '../jobs/queues/timerCompletion.queue';
import * as sessionsService from '../modules/sessions/sessions.service';
import { DEFAULT_TIMEZONE } from '../shared/utils/timezone';
import { clearActiveTimer, getActiveTimer } from './activeTimer';

// Cobre reload de pagina, queda de rede momentanea, etc - so age depois desse
// prazo sem nenhum socket do usuario reconectar.
const GRACE_MS = 60_000;

// Por processo (nao coordenado via Redis) - coerente com o adapter Redis do
// Socket.io ja estar pronto pra multi-instancia (io.in(room).allSockets() consulta
// o cluster todo), mas o temporizador de tolerancia em si ainda e local. Se um dia
// rodar mais de uma instancia da API, isso precisa migrar pra um lock distribuido;
// documentado aqui pra nao ser esquecido.
interface PendingGrace {
  timer: ReturnType<typeof setTimeout>;
  // Congela o instante da desconexao - a duracao gravada usa ISSO, nunca o momento
  // em que a janela de tolerancia expira. A tolerancia existe pra dar tempo do
  // usuario reconectar, nao pra virar tempo de estudo creditado de graca.
  disconnectedAt: number;
}
const pendingTimers = new Map<string, PendingGrace>();

function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function cancelDisconnectGrace(userId: string) {
  const pending = pendingTimers.get(userId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingTimers.delete(userId);
  }
}

/**
 * Chamado quando o ultimo socket conhecido do usuario desconecta. Nao finaliza
 * nada na hora - agenda a checagem final pro fim da janela de tolerancia, quando
 * reconfirma (via allSockets(), que consulta o cluster inteiro pelo adapter Redis)
 * que o usuario continua sem nenhum socket antes de agir. Essa reconfirmacao evita
 * a corrida entre "ultimo socket caiu" e "novo socket conectou" acontecendo quase
 * ao mesmo tempo.
 */
export function scheduleDisconnectGrace(io: Server, userId: string) {
  cancelDisconnectGrace(userId);
  const disconnectedAt = Date.now();
  const timer = setTimeout(() => {
    pendingTimers.delete(userId);
    void finalizeIfStillDisconnected(io, userId, disconnectedAt);
  }, GRACE_MS);
  pendingTimers.set(userId, { timer, disconnectedAt });
}

async function finalizeIfStillDisconnected(
  io: Server,
  userId: string,
  disconnectedAt: number,
) {
  const stillConnected = await io.in(userRoom(userId)).allSockets();
  if (stillConnected.size > 0) return; // reconectou dentro da janela - nada a fazer

  const active = await getActiveTimer(userId);
  if (!active || active.status !== 'running') return;

  // Duracao real decorrida ate a DESCONEXAO (disconnectedAt, congelado acima) - nao
  // ate agora, que ja inclui os 60s de tolerancia. O motivo dessa correcao existir:
  // o job do BullMQ completava sempre com a duracao cheia do ciclo, creditando
  // tempo que nunca foi estudado se a aba fechasse antes do fim; usar "agora" aqui
  // reintroduziria o mesmo tipo de erro, soomando a janela de tolerancia como se
  // fosse tempo estudado.
  const elapsedSinceUpdate = Math.floor(
    (disconnectedAt - new Date(active.updatedAt).getTime()) / 1000,
  );
  const currentRemaining = Math.max(0, active.remainingSeconds - elapsedSinceUpdate);
  const durationSeconds = active.totalSeconds - currentRemaining;

  // Cancela o job de finalizacao "no horario cheio" ANTES de qualquer outra coisa -
  // senao ele dispara depois e credita a sessao de novo com a duracao total.
  await cancelCompletion(userId);
  await clearActiveTimer(userId);

  if (durationSeconds <= 0) return; // nada de fato estudado nesse trecho

  // Sem req.user aqui (nao e uma request HTTP) - busca o fuso direto no banco.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const timezone = user?.timezone ?? DEFAULT_TIMEZONE;

  await sessionsService.createSession(userId, timezone, {
    subjectId: active.mode === 'FOCUS' ? (active.subjectId ?? undefined) : undefined,
    type: active.mode,
    durationSeconds,
    completed: false,
    startedAt: new Date(active.startedAt),
    // O fim real da sessao e a desconexao, nao o momento em que a tolerancia
    // expirou e o servidor finalmente agiu.
    finishedAt: new Date(disconnectedAt),
  });

  logger.info(
    { userId, durationSeconds, mode: active.mode },
    'Timer session finalized as interrupted after disconnect grace period',
  );
}
