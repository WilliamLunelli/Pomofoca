import { Router } from 'express';

import { authMiddleware } from '../../middlewares/auth.middleware';
import {
  enforceReportHistoryLimit,
  requirePremium,
} from '../../middlewares/plan.middleware';
import { validate } from '../../middlewares/validate.middleware';
import { asyncHandler } from '../../shared/utils/asyncHandler';
import {
  breakdownHandler,
  compareHandler,
  heatmapHandler,
  streakHandler,
  summaryHandler,
  trendHandler,
} from './reports.controller';
import {
  compareQuerySchema,
  heatmapQuerySchema,
  rangeQuerySchema,
  summaryQuerySchema,
  trendQuerySchema,
} from './reports.schema';

const router = Router();

router.use(authMiddleware);

// enforceReportHistoryLimit e requirePremium sao sincronos (nao tocam o banco), entao
// nao precisam de asyncHandler - Express ja captura throws sincronos nativamente.
router.get(
  '/summary',
  validate(summaryQuerySchema, 'query'),
  enforceReportHistoryLimit,
  asyncHandler(summaryHandler),
);
router.get(
  '/breakdown',
  validate(rangeQuerySchema, 'query'),
  enforceReportHistoryLimit,
  asyncHandler(breakdownHandler),
);
router.get(
  '/heatmap',
  validate(heatmapQuerySchema, 'query'),
  requirePremium('Heatmap anual'),
  asyncHandler(heatmapHandler),
);
router.get(
  '/trend',
  validate(trendQuerySchema, 'query'),
  enforceReportHistoryLimit,
  asyncHandler(trendHandler),
);
router.get('/streak', asyncHandler(streakHandler));
router.get(
  '/compare',
  validate(compareQuerySchema, 'query'),
  requirePremium('Comparação entre períodos'),
  asyncHandler(compareHandler),
);

export { router as reportsRoutes };
