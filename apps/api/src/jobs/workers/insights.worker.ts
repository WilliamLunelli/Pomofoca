import { Worker } from 'bullmq';
import type { Prisma } from '@prisma/client';

import { prisma } from '../../config/database';
import { logger } from '../../config/logger';
import { redis } from '../../config/redis';
import { computeInsightsForUser } from '../../modules/insights/insights.service';
import { insightsQueue } from '../queues/insights.queue';

/**
 * Recalculo semanal dos InsightSnapshot - so pra usuarios Premium (Free nunca ve
 * o resultado, entao nem checa os pisos pra eles - economiza processamento). Roda
 * na mesma cadencia do learn-reminder-times (jobs/workers/notifications.worker.ts)
 * mas em queue/worker proprios, ja que sao dominios diferentes.
 */
async function runWeeklyRecalculation(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { plan: 'PREMIUM' },
    select: { id: true, timezone: true },
  });

  let computed = 0;
  let skipped = 0;

  for (const user of users) {
    const result = await computeInsightsForUser(user.id, user.timezone);
    if (!result.eligible) {
      skipped += 1;
      continue;
    }

    await prisma.insightSnapshot.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        generatedAt: new Date(),
        insights: result.insights as unknown as Prisma.InputJsonValue,
        dataPointsUsed: result.dataPointsUsed,
      },
      update: {
        generatedAt: new Date(),
        insights: result.insights as unknown as Prisma.InputJsonValue,
        dataPointsUsed: result.dataPointsUsed,
      },
    });
    computed += 1;
  }

  logger.info(
    { userCount: users.length, computed, skipped },
    'Weekly insights recalculation completed',
  );
}

export function initInsightsWorker(): Worker {
  const worker = new Worker(
    'insights',
    async (job) => {
      if (job.name === 'weekly-recalculation') return runWeeklyRecalculation();
      logger.info({ jobId: job.id, name: job.name }, 'Unknown insights job, skipping');
    },
    { connection: redis },
  );

  worker.on('failed', (job, err) =>
    logger.error({ err, jobId: job?.id, name: job?.name }, 'Insights job failed'),
  );

  void insightsQueue.add(
    'weekly-recalculation',
    {},
    { repeat: { pattern: '0 3 * * 1' }, jobId: 'weekly-recalculation' },
  );

  return worker;
}
