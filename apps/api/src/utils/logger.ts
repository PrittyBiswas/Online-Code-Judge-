import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'headers.authorization',
      'headers.cookie',
      'password',
      'token',
      'refreshToken',
      'secret',
      'secretKey',
      'jwtSecret',
      'cookieSecret',
      'code',
      'hiddenTests',
      '*.password',
      '*.token',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  base: {
    service: 'judge-api',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
