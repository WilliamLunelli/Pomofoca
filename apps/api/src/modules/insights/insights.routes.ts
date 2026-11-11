import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware';
import { requirePremium } from '../../middlewares/plan.middleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import { getInsightsHandler } from './insights.controller';

const router = Router();

router.use(authMiddleware, requirePremium('Insights adaptativos'));

router.get('/', asyncHandler(getInsightsHandler));

export { router as insightsRoutes };
