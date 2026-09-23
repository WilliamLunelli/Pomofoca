import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { getMeHandler, updateMeHandler } from './users.controller';
import { updateUserSchema } from './users.schema';

const router = Router();

router.use(authMiddleware);

router.get('/me', asyncHandler(getMeHandler));
router.patch('/me', validate(updateUserSchema), asyncHandler(updateMeHandler));

export { router as usersRoutes };
