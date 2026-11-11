import rateLimit from 'express-rate-limit';

import { env } from '../config/env';

// Em dev, os limites de producao (10 req/15min em /auth, 300 em geral) atrapalham
// testes manuais e scripts de seed - sobem bastante em vez de desligar de fato
// (mantem o middleware exercitado, so nao trava o fluxo de desenvolvimento).
const isDev = env.NODE_ENV === 'development';

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 10_000 : 10,
  standardHeaders: true,
  legacyHeaders: false,
});

export const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: isDev ? 10_000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
});

export const defaultRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: isDev ? 10_000 : 300,
  standardHeaders: true,
  legacyHeaders: false,
});
