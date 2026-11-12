import { Request, Response, NextFunction, CookieOptions } from 'express';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { env } from '../config/env.js';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';
import { Role, ERROR_CODES } from '@judge/shared';
import { AppError } from '../utils/app-error.js';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: Role;
}

interface JwtPayloadClaims {
  id: string;
  role?: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function parseDurationToMs(duration: string): number {
  const match = /^(\d+)([smhd])$/i.exec(duration.trim());
  if (!match) return 15 * 60 * 1000;
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return amount * multipliers[unit];
}

export function getAuthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: parseDurationToMs(env.JWT_EXPIRES_IN),
  };
}

export function getClearAuthCookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  };
}

export function signAuthToken(user: AuthUser): string {
  const payload: JwtPayloadClaims = { id: user.id, role: user.role };
  return jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as SignOptions['expiresIn'],
  });
}

export async function extractUserFromToken(req: Request): Promise<AuthUser | null> {
  const token = req.cookies?.[env.AUTH_COOKIE_NAME];
  if (!token || typeof token !== 'string') return null;

  let decoded: JwtPayloadClaims;
  try {
    decoded = jwt.verify(token, env.JWT_SECRET) as JwtPayloadClaims;
  } catch {
    return null;
  }

  if (!decoded?.id || typeof decoded.id !== 'string') {
    return null;
  }

  try {
    const [dbUser] = await db
      .select({
        id: users.id,
        username: users.username,
        email: users.email,
        role: users.role,
      })
      .from(users)
      .where(eq(users.id, decoded.id))
      .limit(1);

    if (!dbUser) {
      return null;
    }

    return {
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      role: dbUser.role as Role,
    };
  } catch {
    return null;
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await extractUserFromToken(req);
    if (!user) {
      return next(new AppError(ERROR_CODES.AUTH_UNAUTHORIZED, 'Authentication required', 401));
    }
    req.user = user;
    return next();
  } catch (err) {
    return next(err);
  }
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    req.user = (await extractUserFromToken(req)) || undefined;
    return next();
  } catch {
    req.user = undefined;
    return next();
  }
}
