import { Router } from 'express';

import { authRoutes } from '../modules/auth/auth.routes';

const router = Router();

router.use('/auth', authRoutes);

// Módulos serão registrados aqui conforme forem implementados:
// router.use('/users', usersRoutes);
// router.use('/subjects', subjectsRoutes);
// router.use('/sessions', sessionsRoutes);
// router.use('/reports', reportsRoutes);
// router.use('/subscriptions', subscriptionsRoutes);

export { router };
