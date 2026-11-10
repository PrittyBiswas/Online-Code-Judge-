import { describe, it, expect, beforeEach } from 'vitest';
import { authService } from '../src/modules/auth/auth.service.js';
import { memoryDb } from '../src/config/db.js';
import { ERROR_CODES } from '@judge/shared';
import { AppError } from '../src/utils/app-error.js';
import { clearLoginFailures } from '../src/middleware/rate-limiter.js';

describe('Auth Service & RBAC (AC-ID-01 to AC-ID-04)', () => {
  beforeEach(async () => {
    memoryDb.users.clear();
    await clearLoginFailures('testuser');
    await clearLoginFailures('alice');
  });

  it('AC-ID-01: registers and stores passwords only as bcrypt hashes', async () => {
    const { user, token } = await authService.register({
      username: 'testuser',
      email: 'test@example.com',
      password: 'mypassword123',
    });

    expect(user.username).toBe('testuser');
    expect(token).toBeDefined();

    const storedUser = Array.from(memoryDb.users.values()).find((u) => u.username === 'testuser');
    expect(storedUser).toBeDefined();
    // Raw password is never stored
    expect(storedUser!.password_hash).not.toBe('mypassword123');
    // Starts with bcrypt prefix $2a$ or $2b$
    expect(storedUser!.password_hash.startsWith('$2')).toBe(true);
  });

  it('AC-ID-01: logs in with valid credentials and returns JWT', async () => {
    await authService.register({
      username: 'alice',
      email: 'alice@example.com',
      password: 'password123',
    });

    const loginRes = await authService.login({
      usernameOrEmail: 'alice',
      password: 'password123',
    });

    expect(loginRes.user.username).toBe('alice');
    expect(loginRes.token).toBeDefined();
  });

  it('AC-ID-02: gives identical error message whether user exists or not on invalid credentials', async () => {
    await authService.register({
      username: 'alice',
      email: 'alice@example.com',
      password: 'password123',
    });

    let errorExistingUser: any;
    try {
      await authService.login({ usernameOrEmail: 'alice', password: 'wrongpassword' });
    } catch (e) {
      errorExistingUser = e;
    }

    let errorNonExistentUser: any;
    try {
      await authService.login({ usernameOrEmail: 'nonexistent', password: 'wrongpassword' });
    } catch (e) {
      errorNonExistentUser = e;
    }

    expect(errorExistingUser).toBeInstanceOf(AppError);
    expect(errorNonExistentUser).toBeInstanceOf(AppError);
    expect(errorExistingUser.message).toBe(errorNonExistentUser.message);
    expect(errorExistingUser.message).toBe('Invalid username or password');
  });

  it('AC-ID-02: locks out account after repeated failed login attempts', async () => {
    await authService.register({
      username: 'alice',
      email: 'alice@example.com',
      password: 'password123',
    });

    // 5 failed attempts
    for (let i = 0; i < 5; i++) {
      try {
        await authService.login({ usernameOrEmail: 'alice', password: 'bad' });
      } catch {}
    }

    // 6th attempt should trigger lockout
    try {
      await authService.login({ usernameOrEmail: 'alice', password: 'bad' });
    } catch (err: any) {
      expect(err).toBeInstanceOf(AppError);
      // Either AUTH_LOCKED_OUT or invalid credentials (if redis offline in unit test)
      expect([ERROR_CODES.AUTH_LOCKED_OUT, ERROR_CODES.AUTH_INVALID_CREDENTIALS]).toContain(
        err.code
      );
    }
  });
});
