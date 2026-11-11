import { Queue } from 'bullmq';

import { redis } from '../../config/redis';

export const insightsQueue = new Queue('insights', { connection: redis });
