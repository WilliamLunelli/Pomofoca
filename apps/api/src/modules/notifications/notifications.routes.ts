import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePremium } from '../../middlewares/plan.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  getPreferencesHandler,
  subscribeHandler,
  testHandler,
  unsubscribeHandler,
  updatePreferencesHandler,
} from './notifications.controller';
import {
  subscribeSchema,
  unsubscribeSchema,
  updatePreferencesSchema,
} from './notifications.schema';

const router = Router();

router.use(authMiddleware, requirePremium('Notificações'));

router.post('/subscribe', validate(subscribeSchema), asyncHandler(subscribeHandler));
router.delete(
  '/subscribe',
  validate(unsubscribeSchema),
  asyncHandler(unsubscribeHandler),
);
router.get('/preferences', asyncHandler(getPreferencesHandler));
router.patch(
  '/preferences',
  validate(updatePreferencesSchema),
  asyncHandler(updatePreferencesHandler),
);
router.post('/test', asyncHandler(testHandler));

export { router as notificationsRoutes };
