import { Router } from 'express';

import { authRateLimit } from '../../middlewares/rateLimit.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  googleHandler,
  loginHandler,
  logoutHandler,
  refreshHandler,
  registerHandler,
} from './auth.controller';
import {
  googleAuthSchema,
  loginSchema,
  logoutSchema,
  refreshSchema,
  registerSchema,
} from './auth.schema';

const router = Router();

router.use(authRateLimit);

router.post('/register', validate(registerSchema), asyncHandler(registerHandler));
router.post('/login', validate(loginSchema), asyncHandler(loginHandler));
router.post('/google', validate(googleAuthSchema), asyncHandler(googleHandler));
router.post('/refresh', validate(refreshSchema), asyncHandler(refreshHandler));
router.post('/logout', validate(logoutSchema), asyncHandler(logoutHandler));

export { router as authRoutes };
