import { Request, Response, NextFunction } from 'express';
import { Role, ERROR_CODES } from '@judge/shared';
import { AppError } from '../utils/app-error.js';

/**
 * RBAC Authorization Middleware (AC-ID-03).
 * Denies access by default (403) unless caller's role is in the allowed list.
 */
export function requireRole(...allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AppError(ERROR_CODES.AUTH_UNAUTHORIZED, 'Authentication required', 401);
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AppError(
        ERROR_CODES.FORBIDDEN,
        `Access denied: requires one of [${allowedRoles.join(', ')}]`,
        403
      );
    }

    next();
  };
}

