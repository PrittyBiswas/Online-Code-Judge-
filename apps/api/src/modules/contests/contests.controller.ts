import { Request, Response, NextFunction } from 'express';
import { contestsService } from './contests.service.js';
import { createContestSchema } from '@judge/shared';

export class ContestsController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createContestSchema.parse(req.body);
      const contest = await contestsService.createContest(req.user!.id, input);
      return res.status(201).json({ data: { contest } });
    } catch (err) {
      next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const contests = await contestsService.listContests();
      return res.status(200).json({ data: { contests } });
    } catch (err) {
      next(err);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const contest = await contestsService.getContest(id);
      return res.status(200).json({ data: { contest } });
    } catch (err) {
      next(err);
    }
  }

  async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const leaderboard = await contestsService.getContestLeaderboard(id, req.user?.role);
      return res.status(200).json({ data: { leaderboard } });
    } catch (err) {
      next(err);
    }
  }
}

export const contestsController = new ContestsController();

