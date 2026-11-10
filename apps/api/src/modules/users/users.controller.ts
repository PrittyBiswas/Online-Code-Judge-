import { Request, Response, NextFunction } from 'express';
import { usersService } from './users.service.js';

export class UsersController {
  async getProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const { id } = req.params;
      const user = await usersService.getProfile(id);
      return res.status(200).json({ data: { user } });
    } catch (err) {
      return next(err);
    }
  }
}

export const usersController = new UsersController();
