import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { webhookRateLimit } from '../../middlewares/rateLimit.middleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  cancelHandler,
  checkoutHandler,
  getCurrentHandler,
} from './subscriptions.controller';
import { mercadoPagoWebhookSchema } from './subscriptions.schema';
import { mercadoPagoWebhookHandler } from './webhooks.controller';

const router = Router();

router.post(
  '/webhooks/mercado-pago',
  webhookRateLimit,
  validate(mercadoPagoWebhookSchema),
  asyncHandler(mercadoPagoWebhookHandler),
);

router.use(authMiddleware);

router.get('/', asyncHandler(getCurrentHandler));
router.post('/checkout', asyncHandler(checkoutHandler));
router.post('/cancel', asyncHandler(cancelHandler));

export { router as subscriptionsRoutes };
