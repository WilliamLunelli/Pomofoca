import type { Request, Response } from 'express';

import { sendSuccess } from '../../shared/utils/apiResponse';
import * as subscriptionsService from './subscriptions.service';

export async function getCurrentHandler(req: Request, res: Response) {
  const subscription = await subscriptionsService.getCurrentSubscription(req.user!.id);
  return sendSuccess(res, subscription);
}

export async function checkoutHandler(req: Request, res: Response) {
  const result = await subscriptionsService.createCheckout(req.user!.id);
  return sendSuccess(res, result, 201);
}

export async function cancelHandler(req: Request, res: Response) {
  const subscription = await subscriptionsService.cancelSubscription(req.user!.id);
  return sendSuccess(res, subscription);
}
