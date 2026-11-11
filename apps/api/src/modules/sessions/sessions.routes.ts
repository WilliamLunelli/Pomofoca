import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePremium } from '../../middlewares/plan.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  createHandler,
  deleteHandler,
  getActiveHandler,
  getHandler,
  listHandler,
} from './sessions.controller';
import {
  createSessionSchema,
  listSessionsQuerySchema,
  sessionIdParamSchema,
} from './sessions.schema';

const router = Router();

router.use(authMiddleware);

router.post('/', validate(createSessionSchema), asyncHandler(createHandler));
router.get('/', validate(listSessionsQuerySchema, 'query'), asyncHandler(listHandler));
// Antes de "/:id" - senao "active" seria interpretado como um id.
router.get(
  '/active',
  requirePremium('Sincronização entre dispositivos'),
  asyncHandler(getActiveHandler),
);
router.get('/:id', validate(sessionIdParamSchema, 'params'), asyncHandler(getHandler));
router.delete(
  '/:id',
  validate(sessionIdParamSchema, 'params'),
  asyncHandler(deleteHandler),
);

export { router as sessionsRoutes };
