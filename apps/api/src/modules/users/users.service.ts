import { desc, eq, ilike, or } from 'drizzle-orm';
import { User, Role, ERROR_CODES } from '@judge/shared';
import { db } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { AppError } from '../../utils/app-error.js';
import { isUuid, mapDatabaseError } from '../../utils/db-error.js';

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
      throw mapDatabaseError(err);
    }
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
