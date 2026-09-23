import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import pinoHttp from 'pino-http';

import { env } from './config/env';
import { logger } from './config/logger';
import { errorMiddleware } from './middlewares/error.middleware';
import { defaultRateLimit } from './middlewares/rateLimit.middleware';
import { router } from './routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(pinoHttp({ logger }));
app.use(defaultRateLimit);

app.get('/health', (_req, res) => {
  res.status(200).json({ success: true, data: { status: 'ok' } });
});

app.use('/api', router);

app.use(errorMiddleware);

export { app };
