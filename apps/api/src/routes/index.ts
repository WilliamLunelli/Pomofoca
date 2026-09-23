import { Router } from 'express';

import { authRoutes } from '../modules/auth/auth.routes';
import { reportsRoutes } from '../modules/reports/reports.routes';
import { sessionsRoutes } from '../modules/sessions/sessions.routes';
import { subjectsRoutes } from '../modules/subjects/subjects.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/subjects', subjectsRoutes);
router.use('/sessions', sessionsRoutes);
router.use('/reports', reportsRoutes);

// Módulos serão registrados aqui conforme forem implementados:
// router.use('/users', usersRoutes);
// router.use('/subscriptions', subscriptionsRoutes);

export { router };
