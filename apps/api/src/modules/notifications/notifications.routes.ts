import { Router } from 'express';
import { notificationsController } from './notifications.controller.js';
import { requireAuth } from '../../middleware/auth.js';

const notificationsRouter = Router();

// All notification routes require authenticated user
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', (req, res, next) =>
  notificationsController.getNotifications(req, res, next)
);
notificationsRouter.get('/unread-count', (req, res, next) =>
  notificationsController.getUnreadCount(req, res, next)
);
notificationsRouter.get('/activity', (req, res, next) =>
  notificationsController.getActivity(req, res, next)
);
notificationsRouter.get('/live', (req, res, next) =>
  notificationsController.streamLiveNotifications(req, res, next)
);
notificationsRouter.patch('/read-all', (req, res, next) =>
  notificationsController.markAllAsRead(req, res, next)
);
notificationsRouter.patch('/:id/read', (req, res, next) =>
  notificationsController.markAsRead(req, res, next)
);

export { notificationsRouter };
