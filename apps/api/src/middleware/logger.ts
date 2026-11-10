import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.js';

export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();
  const submissionId = req.headers['x-submission-id'] || req.body?.submissionId || undefined;

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info(
      {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: duration,
        submissionId,
      },
      'HTTP Request processed'
    );
  });

  next();
}
