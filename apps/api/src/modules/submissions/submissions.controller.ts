import { Request, Response, NextFunction } from 'express';
import { submissionsService } from './submissions.service.js';
import { createSubmissionSchema, runSampleSchema, querySubmissionsSchema } from '@judge/shared';

export class SubmissionsController {
  async submit(req: Request, res: Response, next: NextFunction) {
    try {
      const input = createSubmissionSchema.parse(req.body);
      const result = await submissionsService.submitCode(req.user!.id, input);
      // HTTP 202 Accepted (AC-SJ-01)
      return res.status(202).json({ data: result });
    } catch (err) {
      return next(err);
    }
  }

  async runSample(req: Request, res: Response, next: NextFunction) {
    try {
      const input = runSampleSchema.parse(req.body);
      const result = await submissionsService.runSample(req.user!.id, input);
      return res.status(202).json({ data: result });
    } catch (err) {
      return next(err);
    }
  }

  async getSampleRun(req: Request, res: Response, next: NextFunction) {
    try {
      const { runId } = req.params;
      const sampleRun = await submissionsService.getSampleRunResult(runId, req.user!.id);
      return res.status(200).json({ data: { sampleRun } });
    } catch (err) {
      return next(err);
    }
  }

  async getOne(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const submission = await submissionsService.getSubmission(id, req.user!.id);
      return res.status(200).json({ data: { submission } });
    } catch (err) {
      return next(err);
    }
  }

  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const queryParams = querySubmissionsSchema.parse(req.query);
      const result = await submissionsService.listSubmissions(req.user!.id, queryParams);
      return res.status(200).json({ data: result });
    } catch (err) {
      return next(err);
    }
  }
}

export const submissionsController = new SubmissionsController();
