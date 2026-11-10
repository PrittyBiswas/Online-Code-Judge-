import { memoryDb } from '../../config/db.js';
import { User, Role } from '@judge/shared';
import { AppError } from '../../utils/app-error.js';
import { ERROR_CODES } from '@judge/shared';

export class UsersService {
  async getProfile(userId: string): Promise<User> {
    const user = memoryDb.users.get(userId);
    if (!user) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);
    }
    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role as Role,
      createdAt: user.created_at.toISOString(),
      updatedAt: user.updated_at.toISOString(),
    };
  }
}

export const usersService = new UsersService();
