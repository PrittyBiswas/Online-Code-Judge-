import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { registerSchema, loginSchema } from '@judge/shared';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const input = registerSchema.parse(req.body);
      const { user, token } = await authService.register(input);

      // Set HTTP-only cookie (AC-ID-01)
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      return res.status(201).json({
        data: { user, token },
      });
    } catch (err) {
      return next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const input = loginSchema.parse(req.body);
      const { user, token } = await authService.login(input);

      // Set HTTP-only cookie (AC-ID-01)
      res.cookie('token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return res.status(200).json({
        data: { user, token },
      });
    } catch (err) {
      return next(err);
    }
  }

  async logout(_req: Request, res: Response) {
    res.clearCookie('token', {
      httpOnly: true,
      sameSite: 'lax',
    });
    return res.status(200).json({
      data: { message: 'Logged out successfully' },
    });
  }

  async me(req: Request, res: Response) {
    return res.status(200).json({
      data: { user: req.user || null },
    });
  }
}

export const authController = new AuthController();
