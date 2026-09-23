import { Queue } from 'bullmq';

import { redis } from '../../config/redis';

export const reportsQueue = new Queue('reports', { connection: redis });
