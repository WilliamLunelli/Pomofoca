import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware';
import { enforceSubjectLimit } from '../../middlewares/plan.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  archiveHandler,
  createHandler,
  getHandler,
  listHandler,
  restoreHandler,
  updateHandler,
} from './subjects.controller';
import {
  createSubjectSchema,
  listSubjectsQuerySchema,
  subjectIdParamSchema,
  updateSubjectSchema,
} from './subjects.schema';

const router = Router();

router.use(authMiddleware);

router.post(
  '/',
  validate(createSubjectSchema),
  asyncHandler(enforceSubjectLimit),
  asyncHandler(createHandler),
);
router.get('/', validate(listSubjectsQuerySchema, 'query'), asyncHandler(listHandler));
router.get('/:id', validate(subjectIdParamSchema, 'params'), asyncHandler(getHandler));
router.patch(
  '/:id',
  validate(subjectIdParamSchema, 'params'),
  validate(updateSubjectSchema),
  asyncHandler(updateHandler),
);
router.delete(
  '/:id',
  validate(subjectIdParamSchema, 'params'),
  asyncHandler(archiveHandler),
);
router.patch(
  '/:id/restore',
  validate(subjectIdParamSchema, 'params'),
  asyncHandler(restoreHandler),
);

export { router as subjectsRoutes };
