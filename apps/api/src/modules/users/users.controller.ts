import { Request, Response, NextFunction } from 'express';
import { updateProfileSchema, uploadAvatarSchema } from '@judge/shared';
import { usersService } from './users.service.js';

export class UsersController {
  async getMyProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const profile = await usersService.getMyProfile(userId);
      return res.status(200).json({ data: { profile } });
    } catch (err) {
      return next(err);
    }
  }

  async updateMyProfile(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const input = updateProfileSchema.parse(req.body);
      const profile = await usersService.updateMyProfile(userId, input);
      return res.status(200).json({
        data: {
          profile,
          message: 'Profile updated successfully',
        },
      });
    } catch (err) {
      return next(err);
    }
  }

  async uploadAvatar(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const input = uploadAvatarSchema.parse(req.body);
      const result = await usersService.uploadAvatar(userId, input.dataUrl);
      return res.status(200).json({
        data: {
          avatarUrl: result.avatarUrl,
          message: 'Avatar uploaded successfully',
        },
      });
    } catch (err) {
      return next(err);
    }
  }

  async deleteAvatar(req: Request, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      await usersService.deleteAvatar(userId);
      return res.status(200).json({
        data: {
          message: 'Avatar removed successfully',
        },
      });
    } catch (err) {
      return next(err);
    }
  }

  async getAvatar(req: Request, res: Response, next: NextFunction) {
    try {
      const key = (req.params[0] || req.params.key || '').trim();
      const decodedKey = decodeURIComponent(key);
      const { buffer, mimeType } = await usersService.getAvatarByKey(decodedKey);
      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      return res.status(200).send(buffer);
    } catch (err) {
      return next(err);
    }
  }

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
