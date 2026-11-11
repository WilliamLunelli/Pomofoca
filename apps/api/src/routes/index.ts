import { Router } from 'express';

import { authRoutes } from '../modules/auth/auth.routes';
import { insightsRoutes } from '../modules/insights/insights.routes';
import { notificationsRoutes } from '../modules/notifications/notifications.routes';
import { reportsRoutes } from '../modules/reports/reports.routes';
import { routineRoutes } from '../modules/routine/routine.routes';
import { sessionsRoutes } from '../modules/sessions/sessions.routes';
import { subjectsRoutes } from '../modules/subjects/subjects.routes';
import { subscriptionsRoutes } from '../modules/subscriptions/subscriptions.routes';
import { subjectTasksRoutes, tasksRoutes } from '../modules/tasks/tasks.routes';
import { usersRoutes } from '../modules/users/users.routes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
// Antes de "/subjects" - mais especifica, evita qualquer ambiguidade de path.
router.use('/subjects/:subjectId/tasks', subjectTasksRoutes);
router.use('/subjects', subjectsRoutes);
router.use('/tasks', tasksRoutes);
router.use('/routine', routineRoutes);
router.use('/sessions', sessionsRoutes);
router.use('/reports', reportsRoutes);
router.use('/subscriptions', subscriptionsRoutes);
router.use('/notifications', notificationsRoutes);
router.use('/insights', insightsRoutes);

export { router };
