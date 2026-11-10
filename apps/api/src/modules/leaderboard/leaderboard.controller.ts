import { Request, Response, NextFunction } from 'express';
import { leaderboardService } from './leaderboard.service.js';

export class LeaderboardController {
  async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const entries = await leaderboardService.getGlobalLeaderboard(limit);
      return res.status(200).json({ data: { leaderboard: entries } });
    } catch (err) {
      return next(err);
    }
  }

  async rebuild(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = await leaderboardService.rebuildLeaderboard();
      return res.status(200).json({
        data: {
          message: 'Leaderboard rebuilt successfully from database state (AC-LB-03)',
          ...result,
        },
      });
    } catch (err) {
      return next(err);
    }
  }
}

export const leaderboardController = new LeaderboardController();
