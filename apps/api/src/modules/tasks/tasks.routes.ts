import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware';
import { enforceTaskLimit } from '../../middlewares/plan.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  createHandler,
  deleteHandler,
  listHandler,
  updateHandler,
} from './tasks.controller';
import {
  createTaskSchema,
  subjectIdParamSchema,
  taskIdParamSchema,
  updateTaskSchema,
} from './tasks.schema';

// Aninhada em /subjects/:subjectId/tasks - mergeParams pra enxergar :subjectId
// do path pai.
export const subjectTasksRoutes = Router({ mergeParams: true });
subjectTasksRoutes.use(authMiddleware);
subjectTasksRoutes.post(
  '/',
  validate(subjectIdParamSchema, 'params'),
  enforceTaskLimit,
  validate(createTaskSchema),
  asyncHandler(createHandler),
);
subjectTasksRoutes.get(
  '/',
  validate(subjectIdParamSchema, 'params'),
  asyncHandler(listHandler),
);

// Plana em /tasks/:id - editar/apagar nao dependem de saber a materia de antemao.
export const tasksRoutes = Router();
tasksRoutes.use(authMiddleware);
tasksRoutes.patch(
  '/:id',
  validate(taskIdParamSchema, 'params'),
  validate(updateTaskSchema),
  asyncHandler(updateHandler),
);
tasksRoutes.delete(
  '/:id',
  validate(taskIdParamSchema, 'params'),
  asyncHandler(deleteHandler),
);
