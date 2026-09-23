import { Worker } from 'bullmq';

import { redis } from '../../config/redis';
import { logger } from '../../config/logger';

const worker = new Worker(
  'reports',
  async (job) => {
    logger.info({ jobId: job.id, name: job.name }, 'Processing report job');
    // TODO: implementar geração de relatório (heatmap anual, exportação PDF) no módulo reports
  },
  { connection: redis },
);

worker.on('completed', (job) => logger.info({ jobId: job.id }, 'Report job completed'));
worker.on('failed', (job, error) =>
  logger.error({ jobId: job?.id, error }, 'Report job failed'),
);
