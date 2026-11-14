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
      return next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const contests = await contestsService.listContests(req.user?.id);
      return res.status(200).json({ data: { contests } });
    } catch (err) {
      return next(err);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const contest = await contestsService.getContest(id, req.user?.id);
      return res.status(200).json({ data: { contest } });
    } catch (err) {
      return next(err);
    }
  }

  async getProblems(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const problems = await contestsService.getContestProblems(id, req.user);
      return res.status(200).json({ data: { problems } });
    } catch (err) {
      return next(err);
    }
  }

  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await contestsService.registerParticipant(id, req.user!.id);
      return res.status(200).json({ data: result });
    } catch (err) {
      return next(err);
    }
  }

  async unregister(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await contestsService.unregisterParticipant(id, req.user!.id);
      return res.status(200).json({ data: result });
    } catch (err) {
      return next(err);
    }
  }

  async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const leaderboard = await contestsService.getContestLeaderboard(id, req.user?.role);
      return res.status(200).json({ data: { leaderboard } });
    } catch (err) {
      return next(err);
    }
  }
}

export const contestsController = new ContestsController();
