import { Router } from 'express';

import { authRoutes } from '../modules/auth/auth.routes';
import { subjectsRoutes } from '../modules/subjects/subjects.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/subjects', subjectsRoutes);

// Módulos serão registrados aqui conforme forem implementados:
// router.use('/users', usersRoutes);
// router.use('/sessions', sessionsRoutes);
// router.use('/reports', reportsRoutes);
// router.use('/subscriptions', subscriptionsRoutes);

export { router };
