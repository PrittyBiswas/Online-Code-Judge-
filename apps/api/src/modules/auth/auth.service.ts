import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { env } from '../../config/env.js';
import { query, memoryDb } from '../../config/db.js';
import { RegisterInput, LoginInput, Role, ERROR_CODES } from '@judge/shared';
import { AppError } from '../../utils/app-error.js';
import { checkLoginLockout, recordLoginFailure, clearLoginFailures } from '../../middleware/rate-limiter.js';
import { AuthUser } from '../../middleware/auth.js';

export class AuthService {
  async register(input: RegisterInput): Promise<{ user: AuthUser; token: string }> {
    const existingUser = Array.from(memoryDb.users.values()).find(
      (u) => u.username.toLowerCase() === input.username.toLowerCase() || u.email.toLowerCase() === input.email.toLowerCase()
    );

    if (existingUser) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Username or email already registered', 409);
    }

    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(input.password, saltRounds);
    const userId = crypto.randomUUID();

    const role = input.role || Role.USER;
    await query(
      'INSERT INTO users (id, username, email, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      [userId, input.username, input.email, passwordHash, role]
    );

    const authUser: AuthUser = {
      id: userId,
      username: input.username,
      email: input.email,
      role,
    };

    const token = jwt.sign(authUser, env.JWT_SECRET, { expiresIn: '7d' });
    return { user: authUser, token };
  }

  async login(input: LoginInput): Promise<{ user: AuthUser; token: string }> {
    const identifier = input.usernameOrEmail.trim();

    // Check account lockout status (AC-ID-02)
    const isLocked = await checkLoginLockout(identifier);
    if (isLocked) {
      throw new AppError(
        ERROR_CODES.AUTH_LOCKED_OUT,
        'Account is temporarily locked due to repeated failed logins. Please try again later.',
        423
      );
    }

    // Lookup user by username or email
    const user = Array.from(memoryDb.users.values()).find(
      (u) => u.username.toLowerCase() === identifier.toLowerCase() || u.email.toLowerCase() === identifier.toLowerCase()
    );

    if (!user) {
      await recordLoginFailure(identifier);
      // Response does NOT reveal whether user exists (AC-ID-02)
      throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid username or password', 401);
    }

    const isMatch = await bcrypt.compare(input.password, user.password_hash);
    if (!isMatch) {
      await recordLoginFailure(identifier);
      throw new AppError(ERROR_CODES.AUTH_INVALID_CREDENTIALS, 'Invalid username or password', 401);
    }

    // Successful login: clear failure tracking
    await clearLoginFailures(identifier);

    const authUser: AuthUser = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role as Role,
    };

    const token = jwt.sign(authUser, env.JWT_SECRET, { expiresIn: '7d' });
    return { user: authUser, token };
  }
}

export const authService = new AuthService();
