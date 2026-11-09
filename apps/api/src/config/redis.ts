import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

let isRedisConnected = false;

// Primary Redis client for application caches, rate limits, sorted sets
export const redisClient = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: true,
  lazyConnect: true,
  retryStrategy(times) {
    const delay = Math.min(times * 200, 2000);
    return delay;
  },
});

redisClient.on('connect', () => {
  isRedisConnected = true;
  logger.info({ service: 'redis' }, 'Redis connected successfully');
});

redisClient.on('ready', () => {
  isRedisConnected = true;
});

redisClient.on('error', (err) => {
  isRedisConnected = false;
  logger.warn({ err: err.message }, 'Redis client connection error / offline');
});

redisClient.on('close', () => {
  isRedisConnected = false;
});

// Dedicated Redis client for pub/sub subscriptions (SSE live updates)
export const redisSubscriber = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  retryStrategy(times) {
    return Math.min(times * 200, 2000);
  },
});

redisSubscriber.on('error', (err) => {
  logger.warn({ err: err.message }, 'Redis subscriber error');
});

export function isRedisHealthy(): boolean {
  return isRedisConnected;
}

// Connect eagerly if not in unit test mode
if (env.NODE_ENV !== 'test') {
  redisClient.connect().catch(() => {});
  redisSubscriber.connect().catch(() => {});
}

