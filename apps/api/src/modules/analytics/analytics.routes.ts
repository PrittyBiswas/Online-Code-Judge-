import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { analyticsController } from './analytics.controller.js';

const analyticsRouter = Router();

analyticsRouter.get('/me', requireAuth, (req, res, next) =>
  analyticsController.getMyAnalytics(req, res, next)
);

export { analyticsRouter };
