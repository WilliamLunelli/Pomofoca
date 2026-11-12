import type { Request, Response } from 'express';

import { env } from '../../config/env';
import { sendSuccess } from '../../shared/utils/apiResponse';
import { getHealthStatus } from './health.service';

export async function getHealthHandler(_req: Request, res: Response) {
  const health = await getHealthStatus();
  // Em produção o detalhe por dependência não é exposto (rota pública).
  const body = env.NODE_ENV === 'production' ? { status: health.status } : health;
  // 503 mantém o mesmo formato de sucesso: orquestradores leem status HTTP e corpo.
  return sendSuccess(res, body, health.status === 'ok' ? 200 : 503);
}
