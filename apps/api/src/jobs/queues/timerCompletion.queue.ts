import { Queue } from 'bullmq';

import { redis } from '../../config/redis';

export const timerCompletionQueue = new Queue('timer-completion', { connection: redis });

// Folga entre o momento em que o ciclo deveria terminar e o job realmente rodar -
// da tempo do proprio dispositivo reportar a conclusao (timer:finish/timer:start)
// primeiro, que cancela este job. Sem essa folga, uma corrida entre o job e o
// evento do socket (ambos disparando ~no mesmo segundo) podia gravar a sessao
// duas vezes.
const COMPLETION_GRACE_MS = 10_000;

// So o userId basta - job IDs so precisam ser unicos dentro da fila (que ja e
// dedicada a essa finalidade), e BullMQ rejeita IDs customizados com ":".
function jobId(userId: string): string {
  return userId;
}

export async function scheduleCompletion(userId: string, remainingSeconds: number) {
  await cancelCompletion(userId);
  if (remainingSeconds <= 0) return;
  await timerCompletionQueue.add(
    'complete',
    { userId },
    {
      jobId: jobId(userId),
      delay: remainingSeconds * 1000 + COMPLETION_GRACE_MS,
      removeOnComplete: true,
      removeOnFail: true,
    },
  );
}

export async function cancelCompletion(userId: string) {
  const job = await timerCompletionQueue.getJob(jobId(userId));
  if (!job) return;
  // Job pode ja ter sido promovido/estar rodando bem no instante do cancelamento -
  // ignora o erro, o proprio worker checa o estado no Redis antes de agir mesmo
  // assim (ver timerCompletion.worker.ts).
  await job.remove().catch(() => {});
}
