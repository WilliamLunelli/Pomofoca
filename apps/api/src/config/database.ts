import { PrismaClient } from '@prisma/client';

import { env } from './env';
import { logger } from './logger';

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

prisma
  .$connect()
  .then(() => logger.info('Database connected'))
  .catch((error) => {
    logger.error({ error }, 'Failed to connect to database');
    process.exit(1);
  });
