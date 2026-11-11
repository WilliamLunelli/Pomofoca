import type { Request, Response } from 'express';

import { sendSuccess } from '../../shared/utils/apiResponse';
import * as insightsService from './insights.service';

export async function getInsightsHandler(req: Request, res: Response) {
  const data = await insightsService.getInsights(req.user!.id);
  return sendSuccess(res, data);
}
