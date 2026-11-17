import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { Role } from '@judge/shared';
import { usersController } from '../src/modules/users/users.controller.js';
import { usersService } from '../src/modules/users/users.service.js';

const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

// In-memory test state
const state = {
  users: new Map<string, any>(),
  profiles: new Map<string, any>(),
};

vi.mock('../src/config/redis.js', () => ({
  redisClient: {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
  },
  isRedisHealthy: vi.fn().mockResolvedValue(true),
}));

vi.mock('../src/config/minio.js', () => {
  const store = new Map<string, string>();
  return {
    minioService: {
      putObject: vi.fn(async (key: string, content: string) => {
        store.set(key, content);
        return key;
      }),
      getObject: vi.fn(async (key: string) => store.get(key) || null),
      deleteObject: vi.fn(async (key: string) => {
        store.delete(key);
      }),
      deleteObjects: vi.fn(async (keys: string[]) => {
        for (const k of keys) store.delete(k);
      }),
      isHealthy: vi.fn().mockResolvedValue(true),
    },
  };
});

vi.mock('../src/db/index.js', () => ({
  db: {
    select: (_cols?: any) => ({
      from: (tbl: any) => ({
        where: (condition: any) => ({
          limit: async () => {
            // Check if selecting users or profiles
            const isUserTable = tbl._?.name === 'users' || tbl.name === 'users';
            if (isUserTable) {
              const allUsers = Array.from(state.users.values());
              // Simulated find
              if (condition?.userId) {
                const u = state.users.get(condition.userId);
                return u ? [u] : [];
              }
              return allUsers.slice(0, 1);
            } else {
              const allProfiles = Array.from(state.profiles.values());
              return allProfiles.slice(0, 1);
            }
          },
        }),
        orderBy: () => ({
          limit: async () => Array.from(state.users.values()),
        }),
      }),
    }),
    update: (_tbl: any) => ({
      set: (patch: any) => ({
        where: (_condition: any) => ({
          returning: async () => {
            return [patch];
          },
        }),
      }),
    }),
    insert: (_tbl: any) => ({
      values: (val: any) => ({
        returning: async () => [val],
      }),
    }),
  },
  pool: { query: vi.fn(), end: vi.fn() },
  checkDatabaseConnection: vi.fn().mockResolvedValue(true),
  closeDatabase: vi.fn().mockResolvedValue(undefined),
}));

function createMockReqRes(options: {
  userId?: string;
  role?: Role;
  body?: any;
  params?: Record<string, string>;
  query?: Record<string, any>;
}) {
  const req = {
    user: options.userId
      ? {
          id: options.userId,
          username: 'johndoe',
          email: 'john@example.com',
          role: options.role || Role.USER,
        }
      : undefined,
    body: options.body || {},
    params: options.params || {},
    query: options.query || {},
  } as unknown as Request;

  let statusCode = 200;
  let jsonBody: any = null;
  let sentBody: any = null;
  const headers: Record<string, string> = {};

  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      jsonBody = data;
      return this;
    },
    send(data: any) {
      sentBody = data;
      return this;
    },
    setHeader(key: string, value: string) {
      headers[key.toLowerCase()] = value;
      return this;
    },
    getStatusCode: () => statusCode,
    getJsonBody: () => jsonBody,
    getSentBody: () => sentBody,
    getHeaders: () => headers,
  } as unknown as Response & {
    getStatusCode: () => number;
    getJsonBody: () => any;
    getSentBody: () => any;
    getHeaders: () => Record<string, string>;
  };

  const next = vi.fn() as unknown as NextFunction;

  return { req, res, next };
}

describe('User Profile & Account Settings Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.users.clear();
    state.profiles.clear();

    // Default test user
    state.users.set(TEST_USER_ID, {
      id: TEST_USER_ID,
      username: 'johndoe',
      email: 'john@example.com',
      role: Role.USER,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
    });

    // Other user
    state.users.set(OTHER_USER_ID, {
      id: OTHER_USER_ID,
      username: 'alice',
      email: 'alice@example.com',
      role: Role.USER,
      createdAt: new Date('2026-01-02T00:00:00Z'),
      updatedAt: new Date('2026-01-02T00:00:00Z'),
    });
  });

  describe('1. Profile Retrieval (GET /api/users/me)', () => {
    it('retrieves the authenticated user profile with default nulls when no profile row exists', async () => {
      vi.spyOn(usersService, 'getMyProfile').mockResolvedValueOnce({
        id: TEST_USER_ID,
        username: 'johndoe',
        email: 'john@example.com',
        role: Role.USER,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        emailVerified: true,
        accountStatus: 'active',
        fullName: null,
        phoneNumber: null,
        avatarUrl: null,
        bio: null,
        country: null,
        state: null,
        city: null,
        education: null,
        college: null,
        degree: null,
        skills: [],
        githubUrl: null,
        linkedinUrl: null,
        portfolioUrl: null,
      });

      const { req, res, next } = createMockReqRes({ userId: TEST_USER_ID });
      await usersController.getMyProfile(req, res, next);

      expect(res.getStatusCode()).toBe(200);
      const data = res.getJsonBody().data;
      expect(data.profile.username).toBe('johndoe');
      expect(data.profile.email).toBe('john@example.com');
      expect(data.profile.role).toBe(Role.USER);
      expect(data.profile.emailVerified).toBe(true);
      expect(data.profile.accountStatus).toBe('active');
      expect(data.profile.skills).toEqual([]);
      expect(next).not.toHaveBeenCalled();
    });

    it('retrieves full personal and professional information when saved', async () => {
      vi.spyOn(usersService, 'getMyProfile').mockResolvedValueOnce({
        id: TEST_USER_ID,
        username: 'johndoe',
        email: 'john@example.com',
        role: Role.USER,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        emailVerified: true,
        accountStatus: 'active',
        fullName: 'John Doe',
        phoneNumber: '+1-555-123-4567',
        avatarUrl: '/api/users/avatar/avatars%2Ftest.png',
        bio: 'Competitive programmer and full-stack developer',
        country: 'United States',
        state: 'California',
        city: 'San Francisco',
        education: 'Undergraduate',
        college: 'UC Berkeley',
        degree: 'Computer Science',
        skills: ['TypeScript', 'React', 'Python', 'Docker'],
        githubUrl: 'https://github.com/johndoe',
        linkedinUrl: 'https://linkedin.com/in/johndoe',
        portfolioUrl: 'https://johndoe.dev',
      });

      const { req, res, next } = createMockReqRes({ userId: TEST_USER_ID });
      await usersController.getMyProfile(req, res, next);

      expect(res.getStatusCode()).toBe(200);
      const profile = res.getJsonBody().data.profile;
      expect(profile.fullName).toBe('John Doe');
      expect(profile.college).toBe('UC Berkeley');
      expect(profile.skills).toContain('TypeScript');
      expect(profile.githubUrl).toBe('https://github.com/johndoe');
    });
  });

  describe('2. Profile Updates (PUT /api/users/me)', () => {
    it('successfully updates personal and professional fields', async () => {
      const updatePayload = {
        fullName: 'Johnathan Doe',
        bio: 'Updated bio description',
        country: 'Canada',
        state: 'Ontario',
        city: 'Toronto',
        education: 'Master of Science',
        college: 'University of Toronto',
        degree: 'M.S. Computer Science',
        skills: ['Rust', 'Go', 'Docker'],
        githubUrl: 'https://github.com/johndoe',
        linkedinUrl: 'https://linkedin.com/in/johndoe',
        portfolioUrl: 'https://johndoe.ca',
      };

      vi.spyOn(usersService, 'updateMyProfile').mockResolvedValueOnce({
        id: TEST_USER_ID,
        username: 'johndoe',
        email: 'john@example.com',
        role: Role.USER,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
        emailVerified: true,
        accountStatus: 'active',
        ...updatePayload,
        phoneNumber: null,
        avatarUrl: null,
      });

      const { req, res, next } = createMockReqRes({
        userId: TEST_USER_ID,
        body: updatePayload,
      });

      await usersController.updateMyProfile(req, res, next);

      expect(res.getStatusCode()).toBe(200);
      expect(res.getJsonBody().data.message).toBe('Profile updated successfully');
      expect(res.getJsonBody().data.profile.fullName).toBe('Johnathan Doe');
      expect(res.getJsonBody().data.profile.city).toBe('Toronto');
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects update with invalid email address format', async () => {
      const { req, res, next } = createMockReqRes({
        userId: TEST_USER_ID,
        body: {
          email: 'not-an-email',
        },
      });

      await usersController.updateMyProfile(req, res, next);
      expect(next).toHaveBeenCalled();
      const error = (next as any).mock.calls[0][0];
      expect(error.name).toBe('ZodError');
    });

    it('rejects update with invalid username format (symbols/spaces)', async () => {
      const { req, res, next } = createMockReqRes({
        userId: TEST_USER_ID,
        body: {
          username: 'invalid user name!',
        },
      });

      await usersController.updateMyProfile(req, res, next);
      expect(next).toHaveBeenCalled();
      const error = (next as any).mock.calls[0][0];
      expect(error.name).toBe('ZodError');
    });

    it('rejects update with invalid URLs', async () => {
      const { req, res, next } = createMockReqRes({
        userId: TEST_USER_ID,
        body: {
          githubUrl: 'not_a_valid_url',
        },
      });

      await usersController.updateMyProfile(req, res, next);
      expect(next).toHaveBeenCalled();
      const error = (next as any).mock.calls[0][0];
      expect(error.name).toBe('ZodError');
    });

    it('never allows client to modify protected account metadata like role or id', async () => {
      // Even if client attempts to pass role: 'admin' and id: 'other' in the body,
      // updateMyProfile must only pass validated schema fields and use req.user.id
      const spy = vi.spyOn(usersService, 'updateMyProfile').mockResolvedValueOnce({
        id: TEST_USER_ID, // Protected ID remains unchanged
        username: 'johndoe',
        email: 'john@example.com',
        role: Role.USER, // Protected role remains USER
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: new Date().toISOString(),
        emailVerified: true,
        accountStatus: 'active',
        fullName: 'Hacker Attempt',
        phoneNumber: null,
        avatarUrl: null,
        bio: null,
        country: null,
        state: null,
        city: null,
        education: null,
        college: null,
        degree: null,
        skills: [],
        githubUrl: null,
        linkedinUrl: null,
        portfolioUrl: null,
      });

      const { req, res, next } = createMockReqRes({
        userId: TEST_USER_ID,
        body: {
          id: OTHER_USER_ID,
          role: 'admin',
          createdAt: '2000-01-01T00:00:00.000Z',
          fullName: 'Hacker Attempt',
        },
      });

      await usersController.updateMyProfile(req, res, next);

      expect(res.getStatusCode()).toBe(200);
      expect(spy).toHaveBeenCalledWith(
        TEST_USER_ID, // Service is strictly called with authenticated user's ID
        expect.not.objectContaining({ role: 'admin', id: OTHER_USER_ID })
      );
    });
  });

  describe('3. Avatar Upload & Storage (POST & DELETE /api/users/me/avatar)', () => {
    it('successfully uploads an avatar image and returns avatarUrl', async () => {
      const validPngBase64 =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      vi.spyOn(usersService, 'uploadAvatar').mockResolvedValueOnce({
        avatarUrl: '/api/users/avatar/avatars%2F11111111-1111-4111-8111-111111111111-12345.png',
      });

      const { req, res, next } = createMockReqRes({
        userId: TEST_USER_ID,
        body: { dataUrl: validPngBase64 },
      });

      await usersController.uploadAvatar(req, res, next);

      expect(res.getStatusCode()).toBe(200);
      expect(res.getJsonBody().data.avatarUrl).toContain('/api/users/avatar/');
      expect(res.getJsonBody().data.message).toBe('Avatar uploaded successfully');
      expect(next).not.toHaveBeenCalled();
    });

    it('rejects avatar upload with empty data', async () => {
      const { req, res, next } = createMockReqRes({
        userId: TEST_USER_ID,
        body: { dataUrl: '' },
      });

      await usersController.uploadAvatar(req, res, next);
      expect(next).toHaveBeenCalled();
      const error = (next as any).mock.calls[0][0];
      expect(error.name).toBe('ZodError');
    });

    it('successfully deletes an avatar and cleans up storage', async () => {
      const deleteSpy = vi.spyOn(usersService, 'deleteAvatar').mockResolvedValueOnce();

      const { req, res, next } = createMockReqRes({ userId: TEST_USER_ID });
      await usersController.deleteAvatar(req, res, next);

      expect(res.getStatusCode()).toBe(200);
      expect(res.getJsonBody().data.message).toBe('Avatar removed successfully');
      expect(deleteSpy).toHaveBeenCalledWith(TEST_USER_ID);
    });

    it('serves stored avatar image with correct Content-Type and Cache-Control headers', async () => {
      const fakeBuffer = Buffer.from('test-image-binary');
      vi.spyOn(usersService, 'getAvatarByKey').mockResolvedValueOnce({
        buffer: fakeBuffer,
        mimeType: 'image/png',
      });

      const { req, res, next } = createMockReqRes({
        params: { '0': 'avatars/test-avatar.png' },
      });

      await usersController.getAvatar(req, res, next);

      expect(res.getStatusCode()).toBe(200);
      expect(res.getHeaders()['content-type']).toBe('image/png');
      expect(res.getHeaders()['cache-control']).toBe('public, max-age=86400');
      expect(res.getSentBody()).toEqual(fakeBuffer);
    });
  });
});
