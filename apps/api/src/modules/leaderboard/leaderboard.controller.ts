import { Request, Response, NextFunction } from 'express';
import { leaderboardService } from './leaderboard.service.js';
import { queryLeaderboardSchema } from '@judge/shared';

export class LeaderboardController {
  async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const query = queryLeaderboardSchema.parse(req.query);
      const result = await leaderboardService.getGlobalLeaderboard(query);
      return res.status(200).json({ data: result });
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
