import pino from 'pino';
import { workerEnv } from '../config/env.js';

export const logger = pino({
  level: workerEnv.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      'password',
      'token',
      'secret',
      'secretKey',
      'MINIO_SECRET_KEY',
      'MINIO_ROOT_PASSWORD',
      'code',
      'testCases',
      'hiddenTests',
      '*.password',
      '*.token',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'judge-worker',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
