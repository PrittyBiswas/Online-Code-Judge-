import { ERROR_CODES } from '@judge/shared';
import { AppError } from './app-error.js';
import { logger } from './logger.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

interface PgErrorShape {
  code?: string;
  constraint?: string;
  message?: string;
  cause?: PgErrorShape;
}

function extractPgError(err: unknown): PgErrorShape {
  if (!err || typeof err !== 'object') return {};
  const e = err as PgErrorShape;
  if (e.cause && typeof e.cause === 'object' && e.cause.code) {
    return e.cause;
  }
  return e;
}

export interface DbErrorMessages {
  uniqueViolation?: string;
  foreignKeyViolation?: string;
  invalidInput?: string;
}

/**
 * Translates low-level PostgreSQL / Drizzle driver errors into safe API AppErrors
 * without exposing raw SQL statements, constraint internals, or credentials.
 */
export function mapDatabaseError(err: unknown, messages: DbErrorMessages = {}): AppError {
  if (err instanceof AppError) {
    return err;
  }

  const pgErr = extractPgError(err);
  const code = pgErr.code || '';

  if (code === '23505') {
    return new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      messages.uniqueViolation || 'A record with the provided unique value already exists.',
      409
    );
  }

  if (code === '23503') {
    return new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      messages.foreignKeyViolation || 'Referenced resource does not exist.',
      400
    );
  }

  if (code === '22P02' || code === '23514' || code === '23502') {
    return new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      messages.invalidInput || 'Invalid database input value.',
      400
    );
  }

  logger.error({ pgCode: code, err }, 'Unhandled PostgreSQL error');

  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code.startsWith('08')) {
    return new AppError(
      ERROR_CODES.INTERNAL_ERROR,
      'Database service is temporarily unavailable.',
      503
    );
  }

  return new AppError(ERROR_CODES.INTERNAL_ERROR, 'Database operation failed.', 500);
}
