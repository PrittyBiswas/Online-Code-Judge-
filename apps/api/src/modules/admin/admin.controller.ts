import { Request, Response, NextFunction } from 'express';
import { adminService } from './admin.service.js';

export class AdminController {
  async getStats(_req: Request, res: Response, next: NextFunction) {
    try {
      const stats = await adminService.getSystemStats();
      return res.status(200).json({ data: { stats } });
    } catch (err) {
      return next(err);
    }
  }

  async rejudge(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await adminService.rejudgeSubmission(id);
      return res.status(200).json({ data: result });
    } catch (err) {
      return next(err);
    }
  }

  async kill(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const result = await adminService.killSubmission(id);
      return res.status(200).json({ data: result });
    } catch (err) {
      return next(err);
    }
  }
}

export const adminController = new AdminController();
