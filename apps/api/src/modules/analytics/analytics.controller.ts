import { Request, Response, NextFunction } from 'express';
import { analyticsService } from './analytics.service.js';

export class AnalyticsController {
  async getMyAnalytics(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const analytics = await analyticsService.getUserAnalytics(userId);
      return res.status(200).json({ data: analytics });
    } catch (err) {
      return next(err);
    }
  }
}

export const analyticsController = new AnalyticsController();
