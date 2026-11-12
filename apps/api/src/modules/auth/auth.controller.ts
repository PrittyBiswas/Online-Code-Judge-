import { Request, Response, NextFunction } from 'express';
import { authService } from './auth.service.js';
import { registerSchema, loginSchema } from '@judge/shared';
import { env } from '../../config/env.js';
import { getAuthCookieOptions, getClearAuthCookieOptions } from '../../middleware/auth.js';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction) {
    try {
      const input = registerSchema.parse(req.body);
      const { user, token } = await authService.register(input);

      // Set JWT strictly in HTTP-only cookie; never expose JWT in response JSON
      res.cookie(env.AUTH_COOKIE_NAME, token, getAuthCookieOptions());

      return res.status(201).json({
        data: { user },
      });
    } catch (err) {
      return next(err);
    }
  }

  async login(req: Request, res: Response, next: NextFunction) {
    try {
      const input = loginSchema.parse(req.body);
      const { user, token } = await authService.login(input);

      // Set JWT strictly in HTTP-only cookie; never expose JWT in response JSON
      res.cookie(env.AUTH_COOKIE_NAME, token, getAuthCookieOptions());

      return res.status(200).json({
        data: { user },
      });
    } catch (err) {
      return next(err);
    }
  }

  async logout(_req: Request, res: Response) {
    res.clearCookie(env.AUTH_COOKIE_NAME, getClearAuthCookieOptions());
    return res.status(200).json({
      data: { message: 'Logged out successfully' },
    });
  }

  async me(req: Request, res: Response) {
    return res.status(200).json({
      data: { user: req.user },
    });
  }
}

export const authController = new AuthController();
