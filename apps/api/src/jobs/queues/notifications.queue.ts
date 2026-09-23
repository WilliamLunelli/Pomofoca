import { Queue } from 'bullmq';

import { redis } from '../../config/redis';

export const notificationsQueue = new Queue('notifications', { connection: redis });
