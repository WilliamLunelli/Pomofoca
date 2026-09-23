import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  createHandler,
  deleteHandler,
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
router.get('/:id', validate(sessionIdParamSchema, 'params'), asyncHandler(getHandler));
router.delete(
  '/:id',
  validate(sessionIdParamSchema, 'params'),
  asyncHandler(deleteHandler),
);

export { router as sessionsRoutes };
