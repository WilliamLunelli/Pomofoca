import { Worker, type Job } from 'bullmq';
import type { Server } from 'socket.io';

import { prisma } from '../../config/database';
import { redis } from '../../config/redis';
import { logger } from '../../config/logger';
import * as sessionsService from '../../modules/sessions/sessions.service';
import { clearActiveTimer, getActiveTimer } from '../../realtime/activeTimer';
import { DEFAULT_TIMEZONE } from '../../shared/utils/timezone';

/**
 * Caminho feliz da finalizacao autoritativa: so completa como "completed: true"
 * com a duracao cheia quando o socket do usuario ficou conectado o tempo todo (ex:
 * PWA em segundo plano no celular, tela bloqueada, mas socket vivo). Se o socket
 * cair antes disso, quem finaliza e o `disconnectGrace.ts` - com a duracao REAL
 * decorrida ate a desconexao, marcada como interrompida, e cancelando este job (ver
 * `cancelCompletion` la) pra ele nunca chegar a rodar creditando tempo que nao foi
 * estudado. Este worker roda no MESMO processo da API (nao um `tsx watch` separado
 * como reports/notifications) porque precisa do `io` pra avisar dispositivos ainda
 * conectados - nao ha estado nenhum pra compartilhar entre processos aqui.
 */
export function initTimerCompletionWorker(io: Server): Worker {
  const worker = new Worker(
    'timer-completion',
    async (job: Job<{ userId: string }>) => {
      const { userId } = job.data;
      const active = await getActiveTimer(userId);

      // Nulo ou nao mais "running" = foi pausado/reiniciado/ja finalizado por um
      // dispositivo antes deste job rodar (o job correspondente deveria ter sido
      // cancelado nesses casos - isso e so uma rede de seguranca contra corrida).
      if (!active || active.status !== 'running') return;

      // Sem req.user aqui (nao e uma request HTTP) - busca o fuso direto no banco.
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { timezone: true },
      });
      const timezone = user?.timezone ?? DEFAULT_TIMEZONE;

      await sessionsService.createSession(userId, timezone, {
        subjectId: active.mode === 'FOCUS' ? (active.subjectId ?? undefined) : undefined,
        type: active.mode,
        durationSeconds: active.totalSeconds,
        completed: true,
        startedAt: new Date(active.startedAt),
        finishedAt: new Date(),
      });

      await clearActiveTimer(userId);

      // Nenhum dispositivo respondeu a tempo (senao o job teria sido cancelado),
      // entao o servidor nao sabe qual deveria ser o proximo ciclo (duracoes de
      // foco/pausa sao preferencia local, nunca chegam ao backend - ver
      // usePomodoroSettings). Avisa como "nada rodando agora" em vez de arriscar
      // inventar um proximo ciclo errado pro raro dispositivo que reconectar
      // bem nesse instante.
      io.to(`user:${userId}`).emit('timer:finish', {
        subjectId: null,
        mode: 'FOCUS',
        cycle: 1,
        remainingSeconds: 0,
        totalSeconds: 0,
        status: 'paused',
      });

      logger.info(
        { userId, mode: active.mode },
        'Timer session auto-completed server-side',
      );
    },
    { connection: redis },
  );

  worker.on('failed', (job, err) =>
    logger.error({ err, jobId: job?.id }, 'Timer completion job failed'),
  );

  return worker;
}
