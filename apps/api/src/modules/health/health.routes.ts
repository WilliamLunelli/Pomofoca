import { Router } from 'express';

import { asyncHandler } from '../../shared/utils/asyncHandler';
import { getHealthHandler } from './health.controller';

const router = Router();

// Pública de propósito (healthcheck Docker/Caddy): sem authMiddleware.
router.get('/', asyncHandler(getHealthHandler));

export { router as healthRoutes };
