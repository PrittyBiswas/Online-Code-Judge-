import { Request, Response, NextFunction } from 'express';
import { notificationsService } from './notifications.service.js';
import { contestSseManager } from '../../events/contest-sse.js';
import { notificationQuerySchema, activityQuerySchema } from '@judge/shared';

export class NotificationsController {
  async getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedQuery = notificationQuerySchema.parse(req.query);
      const result = await notificationsService.getUserNotifications(req.user!.id, parsedQuery);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await notificationsService.getUnreadCount(req.user!.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async markAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const notification = await notificationsService.markAsRead(req.user!.id, req.params.id);
      res.status(200).json({ data: notification });
    } catch (err) {
      next(err);
    }
  }

  async markAllAsRead(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await notificationsService.markAllAsRead(req.user!.id);
      res.status(200).json({ data: result });
    } catch (err) {
      next(err);
    }
  }

  async getActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const parsedQuery = activityQuerySchema.parse(req.query);
      const activity = await notificationsService.getUserContestActivity(req.user!.id, parsedQuery);
      res.status(200).json({ data: { activity } });
    } catch (err) {
      next(err);
    }
  }

  async streamLiveNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    return contestSseManager.handleNotificationStream(req, res, next);
  }
}

export const notificationsController = new NotificationsController();
