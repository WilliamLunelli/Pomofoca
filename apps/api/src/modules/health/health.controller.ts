import type { Request, Response } from 'express';

import { sendSuccess } from '../../shared/utils/apiResponse';
import { getHealthStatus } from './health.service';

export async function getHealthHandler(_req: Request, res: Response) {
  const health = await getHealthStatus();
  // 503 mantém o mesmo formato de sucesso: orquestradores leem status HTTP e corpo.
  return sendSuccess(res, health, health.status === 'ok' ? 200 : 503);
}
