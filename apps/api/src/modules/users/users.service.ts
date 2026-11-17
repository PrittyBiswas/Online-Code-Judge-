import { desc, eq, ilike, or, and, ne } from 'drizzle-orm';
import { User, Role, ERROR_CODES, UserProfile, UpdateUserProfileInput } from '@judge/shared';
import { db } from '../../db/index.js';
import { users, userProfiles } from '../../db/schema.js';
import { AppError } from '../../utils/app-error.js';
import { isUuid, mapDatabaseError } from '../../utils/db-error.js';
import { minioService } from '../../config/minio.js';
import { logger } from '../../utils/logger.js';

const safeUserColumns = {
  id: users.id,
  username: users.username,
  email: users.email,
  role: users.role,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

export interface UpdateUserInput {
  username?: string;
  email?: string;
  role?: Role;
}

export class UsersService {
  private mapToDto(row: {
    id: string;
    username: string;
    email: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      role: row.role as Role,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  async getProfile(userId: string): Promise<User> {
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
    }

    try {
      const [user] = await db
        .select(safeUserColumns)
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
      }
      return this.mapToDto(user);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw mapDatabaseError(err);
    }
  }

  async getMyProfile(userId: string): Promise<UserProfile> {
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
    }

    try {
      const [user] = await db
        .select(safeUserColumns)
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
      }

      const [profile] = await db
        .select()
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);

      return {
        id: user.id,
        role: user.role as Role,
        createdAt: user.createdAt.toISOString(),
        updatedAt: user.updatedAt.toISOString(),
        emailVerified: true,
        accountStatus: 'active',
        username: user.username,
        email: user.email,
        fullName: profile?.fullName ?? null,
        phoneNumber: profile?.phoneNumber ?? null,
        avatarUrl: profile?.avatarUrl ?? null,
        bio: profile?.bio ?? null,
        country: profile?.country ?? null,
        state: profile?.state ?? null,
        city: profile?.city ?? null,
        education: profile?.education ?? null,
        college: profile?.college ?? null,
        degree: profile?.degree ?? null,
        skills: profile?.skills ?? [],
        githubUrl: profile?.githubUrl ?? null,
        linkedinUrl: profile?.linkedinUrl ?? null,
        portfolioUrl: profile?.portfolioUrl ?? null,
      };
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw mapDatabaseError(err);
    }
  }

  async updateMyProfile(userId: string, input: UpdateUserProfileInput): Promise<UserProfile> {
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
    }

    try {
      const [user] = await db
        .select(safeUserColumns)
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!user) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
      }

      // Check unique constraints if username or email is being changed
      if (input.username && input.username.toLowerCase() !== user.username.toLowerCase()) {
        const [existingUsername] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(ilike(users.username, input.username), ne(users.id, userId)))
          .limit(1);
        if (existingUsername) {
          throw new AppError(
            ERROR_CODES.CONFLICT,
            'Username is already registered by another account',
            409
          );
        }
      }

      if (input.email && input.email.toLowerCase() !== user.email.toLowerCase()) {
        const [existingEmail] = await db
          .select({ id: users.id })
          .from(users)
          .where(and(ilike(users.email, input.email), ne(users.id, userId)))
          .limit(1);
        if (existingEmail) {
          throw new AppError(
            ERROR_CODES.CONFLICT,
            'Email is already registered by another account',
            409
          );
        }
      }

      // Update core user record if username or email is changed
      const userPatch: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.username) userPatch.username = input.username;
      if (input.email) userPatch.email = input.email;

      await db.update(users).set(userPatch).where(eq(users.id, userId));

      // Check if profile exists
      const [existingProfile] = await db
        .select({ id: userProfiles.id })
        .from(userProfiles)
        .where(eq(userProfiles.userId, userId))
        .limit(1);

      const profileData: Partial<typeof userProfiles.$inferInsert> = {
        updatedAt: new Date(),
      };
      if (input.fullName !== undefined) profileData.fullName = input.fullName;
      if (input.phoneNumber !== undefined) profileData.phoneNumber = input.phoneNumber;
      if (input.avatarUrl !== undefined) profileData.avatarUrl = input.avatarUrl;
      if (input.bio !== undefined) profileData.bio = input.bio;
      if (input.country !== undefined) profileData.country = input.country;
      if (input.state !== undefined) profileData.state = input.state;
      if (input.city !== undefined) profileData.city = input.city;
      if (input.education !== undefined) profileData.education = input.education;
      if (input.college !== undefined) profileData.college = input.college;
      if (input.degree !== undefined) profileData.degree = input.degree;
      if (input.skills !== undefined) profileData.skills = input.skills;
      if (input.githubUrl !== undefined) profileData.githubUrl = input.githubUrl;
      if (input.linkedinUrl !== undefined) profileData.linkedinUrl = input.linkedinUrl;
      if (input.portfolioUrl !== undefined) profileData.portfolioUrl = input.portfolioUrl;

      if (existingProfile) {
        await db.update(userProfiles).set(profileData).where(eq(userProfiles.userId, userId));
      } else {
        await db.insert(userProfiles).values({
          userId,
          fullName: input.fullName ?? null,
          phoneNumber: input.phoneNumber ?? null,
          avatarUrl: input.avatarUrl ?? null,
          bio: input.bio ?? null,
          country: input.country ?? null,
          state: input.state ?? null,
          city: input.city ?? null,
          education: input.education ?? null,
          college: input.college ?? null,
          degree: input.degree ?? null,
          skills: input.skills ?? [],
          githubUrl: input.githubUrl ?? null,
          linkedinUrl: input.linkedinUrl ?? null,
          portfolioUrl: input.portfolioUrl ?? null,
        });
      }

      return this.getMyProfile(userId);
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw mapDatabaseError(err, {
        uniqueViolation: 'Username or email already registered',
      });
    }
  }

  async uploadAvatar(userId: string, dataUrl: string): Promise<{ avatarUrl: string }> {
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
    }

    const match = /^data:(image\/(jpeg|png|webp|gif));base64,(.+)$/.exec(dataUrl);
    if (!match) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Invalid image format. Supported formats: JPEG, PNG, WebP, GIF.',
        400
      );
    }

    const mimeType = match[1];
    const base64Data = match[3];
    const buffer = Buffer.from(base64Data, 'base64');

    if (buffer.length > 2 * 1024 * 1024) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Image file size exceeds the 2MB limit.',
        400
      );
    }

    const extMap: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'image/gif': '.gif',
    };
    const ext = extMap[mimeType] || '.png';
    const key = `avatars/${userId}-${Date.now()}${ext}`;

    await minioService.putObject(key, base64Data);

    const [existingProfile] = await db
      .select({ id: userProfiles.id, avatarKey: userProfiles.avatarKey })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    if (existingProfile?.avatarKey) {
      await minioService.deleteObject(existingProfile.avatarKey).catch((delErr) => {
        logger.warn({ delErr }, 'Failed to delete previous avatar from storage');
      });
    }

    const avatarUrl = `/api/users/avatar/${encodeURIComponent(key)}`;

    if (existingProfile) {
      await db
        .update(userProfiles)
        .set({
          avatarKey: key,
          avatarUrl,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, userId));
    } else {
      await db.insert(userProfiles).values({
        userId,
        avatarKey: key,
        avatarUrl,
      });
    }

    return { avatarUrl };
  }

  async deleteAvatar(userId: string): Promise<void> {
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
    }

    const [existingProfile] = await db
      .select({ id: userProfiles.id, avatarKey: userProfiles.avatarKey })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);

    if (existingProfile?.avatarKey) {
      await minioService.deleteObject(existingProfile.avatarKey).catch(() => {});
    }

    if (existingProfile) {
      await db
        .update(userProfiles)
        .set({
          avatarKey: null,
          avatarUrl: null,
          updatedAt: new Date(),
        })
        .where(eq(userProfiles.userId, userId));
    }
  }

  async getAvatarByKey(key: string): Promise<{ buffer: Buffer; mimeType: string }> {
    if (!key.startsWith('avatars/') || key.includes('..')) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid avatar key', 400);
    }

    const content = await minioService.getObject(key);
    if (!content) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Avatar image not found', 404);
    }

    let mimeType = 'image/png';
    if (key.endsWith('.jpg') || key.endsWith('.jpeg')) mimeType = 'image/jpeg';
    else if (key.endsWith('.webp')) mimeType = 'image/webp';
    else if (key.endsWith('.gif')) mimeType = 'image/gif';

    const buffer = Buffer.from(content, 'base64');
    return { buffer, mimeType };
  }

  async findByUsernameOrEmail(identifier: string): Promise<User | null> {
    const trimmed = identifier.trim();
    if (!trimmed) return null;

    try {
      const [user] = await db
        .select(safeUserColumns)
        .from(users)
        .where(or(ilike(users.username, trimmed), ilike(users.email, trimmed)))
        .limit(1);
      return user ? this.mapToDto(user) : null;
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  async updateUser(userId: string, input: UpdateUserInput): Promise<User> {
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
    }

    const patch: Partial<typeof users.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.username !== undefined) patch.username = input.username;
    if (input.email !== undefined) patch.email = input.email;
    if (input.role !== undefined) patch.role = input.role;

    try {
      const [updated] = await db
        .update(users)
        .set(patch)
        .where(eq(users.id, userId))
        .returning(safeUserColumns);

      if (!updated) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
      }
      return this.mapToDto(updated);
    } catch (err) {
      throw mapDatabaseError(err, {
        uniqueViolation: 'Username or email already registered',
      });
    }
  }

  async listUsers(limit: number = 50): Promise<User[]> {
    try {
      const rows = await db
        .select(safeUserColumns)
        .from(users)
        .orderBy(desc(users.createdAt))
        .limit(limit);
      return rows.map((row) => this.mapToDto(row));
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }
}

export const usersService = new UsersService();
