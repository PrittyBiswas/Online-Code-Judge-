import bcrypt from 'bcrypt';
import { ilike, or } from 'drizzle-orm';
import { z } from 'zod';
import { registerSchema, loginSchema, Role, ERROR_CODES } from '@judge/shared';
import { env } from '../../config/env.js';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { AppError } from '../../utils/app-error.js';
import { mapDatabaseError } from '../../utils/db-error.js';
import {
  checkLoginLockout,
  recordLoginFailure,
  clearLoginFailures,
} from '../../middleware/rate-limiter.js';
import { AuthUser, signAuthToken } from '../../middleware/auth.js';

type RegisterParams = z.input<typeof registerSchema>;
type LoginParams = z.input<typeof loginSchema>;

export class AuthService {
  async register(rawInput: RegisterParams): Promise<{ user: AuthUser; token: string }> {
    const input = registerSchema.parse(rawInput);
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedUsername = input.username.trim();

    try {
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(or(ilike(users.username, normalizedUsername), ilike(users.email, normalizedEmail)))
        .limit(1);

      if (existing.length > 0) {
        throw new AppError(
          ERROR_CODES.VALIDATION_ERROR,
          'Username or email already registered',
          409
        );
      }

      const saltRounds = env.NODE_ENV === 'test' ? 10 : 12;
      const passwordHash = await bcrypt.hash(input.password, saltRounds);

      // Server always enforces default USER role; client-supplied roles are never trusted.
      const [created] = await db
        .insert(users)
        .values({
          username: normalizedUsername,
          email: normalizedEmail,
          passwordHash,
          role: Role.USER,
        })
        .returning({
          id: users.id,
          username: users.username,
          email: users.email,
          role: users.role,
        });

      const authUser: AuthUser = {
        id: created.id,
        username: created.username,
        email: created.email,
        role: created.role as Role,
      };

      const token = signAuthToken(authUser);
      return { user: authUser, token };
    } catch (err) {
      throw mapDatabaseError(err, {
        uniqueViolation: 'Username or email already registered',
      });
    }
  }

  async login(rawInput: LoginParams): Promise<{ user: AuthUser; token: string }> {
    const input = loginSchema.parse(rawInput);
    const rawIdentifier = (input.email ?? input.usernameOrEmail ?? '').trim();
    const identifier = rawIdentifier.includes('@') ? rawIdentifier.toLowerCase() : rawIdentifier;

    // Check account lockout status (AC-ID-02)
    const isLocked = await checkLoginLockout(identifier);
    if (isLocked) {
      throw new AppError(
        ERROR_CODES.AUTH_LOCKED_OUT,
        'Account is temporarily locked due to repeated failed logins. Please try again later.',
        423
      );
    }

    let userRecord:
      | {
          id: string;
          username: string;
          email: string;
          passwordHash: string;
          role: string;
        }
      | undefined;

    try {
      const rows = await db
        .select({
          id: users.id,
          username: users.username,
          email: users.email,
          passwordHash: users.passwordHash,
          role: users.role,
        })
        .from(users)
        .where(or(ilike(users.username, identifier), ilike(users.email, identifier)))
        .limit(1);

      userRecord = rows[0];
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!userRecord) {
      await recordLoginFailure(identifier);
      // Generic response never reveals whether the account exists (AC-ID-02)
      throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid email or password', 401);
    }

    const isMatch = await bcrypt.compare(input.password, userRecord.passwordHash);
    if (!isMatch) {
      await recordLoginFailure(identifier);
      throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid email or password', 401);
    }

    // Successful login: clear failure tracking
    await clearLoginFailures(identifier);

    const authUser: AuthUser = {
      id: userRecord.id,
      username: userRecord.username,
      email: userRecord.email,
      role: userRecord.role as Role,
    };

    const token = signAuthToken(authUser);
    return { user: authUser, token };
  }
}

export const authService = new AuthService();
