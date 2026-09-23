import { Worker } from 'bullmq';

import { redis } from '../../config/redis';
import { logger } from '../../config/logger';

const worker = new Worker(
  'notifications',
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Processing notification job');
    // TODO: implementar envio de e-mails/notificações
  },
  { connection: redis },
);

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Notification job completed'));
worker.on('failed', (job, error) =>
  logger.error({ jobId: job?.id, error }, 'Notification job failed'),
);
