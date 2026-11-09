import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { Role, ERROR_CODES } from '@judge/shared';
import { AppError } from '../utils/app-error.js';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function extractUserFromToken(req: Request): AuthUser | null {
  // Check HTTP-only cookie first (AC-ID-01)
  let token = req.cookies?.token;

  // Fallback to Bearer token header if present
  if (!token && req.headers.authorization?.startsWith('Bearer ')) {
    token = req.headers.authorization.substring(7);
  }

  if (!token) return null;

  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as AuthUser;
    return decoded;
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const user = extractUserFromToken(req);
  if (!user) {
    throw new AppError(ERROR_CODES.AUTH_UNAUTHORIZED, 'Authentication required', 401);
  }
  req.user = user;
  next();
}

export function optionalAuth(req: Request, res: Response, next: NextFunction) {
  req.user = extractUserFromToken(req) || undefined;
  next();
}

