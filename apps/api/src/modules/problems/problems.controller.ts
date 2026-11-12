import { Request, Response, NextFunction } from 'express';
import { problemsService } from './problems.service.js';
import { createProblemSchema, updateProblemSchema, queryProblemsSchema } from '@judge/shared';

export class ProblemsController {
  async create(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createProblemSchema.parse(req.body);
      const problem = await problemsService.createProblem(req.user!.id, input);
      return res.status(201).json({ data: { problem } });
    } catch (err) {
      return next(err);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const problem = await problemsService.getProblem(id);
      return res.status(200).json({ data: { problem } });
    } catch (err) {
      return next(err);
    }
  }

  async update(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const input = updateProblemSchema.parse(req.body);
      const problem = await problemsService.updateProblem(id, input);
      return res.status(200).json({ data: { problem } });
    } catch (err) {
      return next(err);
    }
  }

  async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await problemsService.deleteProblem(id);
      return res.status(200).json({ data: result });
    } catch (err) {
      return next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const queryParams = queryProblemsSchema.parse(req.query);
      const result = await problemsService.listProblems(queryParams);
      return res.status(200).json({ data: result });
    } catch (err) {
      return next(err);
    }
  }
}

export const problemsController = new ProblemsController();
