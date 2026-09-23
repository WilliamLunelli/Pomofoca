import type { Request, Response } from 'express';

import { sendSuccess } from '../../shared/utils/apiResponse';
import * as subscriptionsService from './subscriptions.service';
import type { MercadoPagoWebhookInput } from './subscriptions.schema';

export async function mercadoPagoWebhookHandler(req: Request, res: Response) {
  await subscriptionsService.handleWebhook(req.body as MercadoPagoWebhookInput, {
    xSignature: req.header('x-signature'),
    xRequestId: req.header('x-request-id'),
  });
  // Mercado Pago espera 200/201 rapido - sem isso, ele reenvia o mesmo evento em backoff.
  return sendSuccess(res, null, 200);
}
