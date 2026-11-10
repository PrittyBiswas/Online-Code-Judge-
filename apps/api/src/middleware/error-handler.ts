import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/app-error.js';
import { ERROR_CODES } from '@judge/shared';
import { logger } from '../utils/logger.js';

/**
 * Standardized Global Error Handler (Part 4.2: One error shape: { code, message })
 */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  logger.error({ err, path: req.path, method: req.method }, 'Request error caught');

  // Handle Zod Schema Validation Errors
  if (err instanceof ZodError) {
    const firstIssue = err.issues[0];
    const message = firstIssue
      ? `${firstIssue.path.join('.')}: ${firstIssue.message}`
      : 'Validation error';
    return res.status(400).json({
      code: ERROR_CODES.VALIDATION_ERROR,
      message,
    });
  }

  // Handle Application Controlled Errors
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({
      code: err.code,
      message: err.message,
    });
  }

  // Unhandled / Internal Server Errors
  return res.status(500).json({
    code: ERROR_CODES.INTERNAL_ERROR,
    message: 'An unexpected internal error occurred.',
  });
}
