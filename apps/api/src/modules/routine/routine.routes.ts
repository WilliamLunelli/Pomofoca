import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  createHandler,
  deleteHandler,
  listHandler,
  updateHandler,
} from './routine.controller';
import {
  createRoutineBlockSchema,
  routineBlockIdParamSchema,
  updateRoutineBlockSchema,
} from './routine.schema';

const router = Router();

// Sem plan.middleware - rotina semanal fica disponivel no Free tambem (ver
// CLAUDE.md/prompt original: ajuda a converter quem ainda nao decidiu assinar).
router.use(authMiddleware);

router.post('/', validate(createRoutineBlockSchema), asyncHandler(createHandler));
router.get('/', asyncHandler(listHandler));
router.patch(
  '/:id',
  validate(routineBlockIdParamSchema, 'params'),
  validate(updateRoutineBlockSchema),
  asyncHandler(updateHandler),
);
router.delete(
  '/:id',
  validate(routineBlockIdParamSchema, 'params'),
  asyncHandler(deleteHandler),
);

export { router as routineRoutes };
