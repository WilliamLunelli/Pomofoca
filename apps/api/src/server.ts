import { createServer } from 'node:http';

import { app } from './app';
import { env } from './config/env';
import { logger } from './config/logger';
import { initInsightsWorker } from './jobs/workers/insights.worker';
import { initNotificationsWorker } from './jobs/workers/notifications.worker';
import { initRealtime } from './realtime/socket';

const httpServer = createServer(app);
initRealtime(httpServer);
// Rodam no mesmo processo (nao `npm run worker:notifications` separado) - projeto
// ainda em escala pequena, e um worker separado que ninguem lembra de iniciar so
// significa jobs agendados que nunca rodam. Extrair pra processo proprio depois e
// trivial (os scripts ja existem) se a escala pedir.
initNotificationsWorker();
initInsightsWorker();

httpServer.listen(env.PORT, () => {
  logger.info(`Pomofoca API listening on port ${env.PORT}`);
});
