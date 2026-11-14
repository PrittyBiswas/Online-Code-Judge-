import { NextFunction, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { redisSubscriber } from '../config/redis.js';
import { db } from '../db/index.js';
import { contests } from '../db/schema.js';
import { ERROR_CODES, REDIS_KEYS, Role, LeaderboardEntry, ContestUpdateEvent } from '@judge/shared';
import { logger } from '../utils/logger.js';
import { isUuid } from '../utils/db-error.js';
import { AppError } from '../utils/app-error.js';
import { contestsService } from '../modules/contests/contests.service.js';

export interface ContestSSEClient {
  id: string;
  contestId: string;
  role?: Role;
  userId?: string;
  res: Response;
  ready: boolean;
  cleanup: () => void;
}

export class ContestSSEManager {
  private clients = new Map<string, Set<ContestSSEClient>>();
  private isSubscribed = false;

  constructor() {
    this.setupRedisSubscriber();
  }

  public ensureSubscribed() {
    if (!this.isSubscribed && typeof redisSubscriber.subscribe === 'function') {
      this.subscribeToEvents();
    }
  }

  private subscribeToEvents() {
    try {
      if (typeof redisSubscriber.subscribe === 'function') {
        redisSubscriber.subscribe(REDIS_KEYS.CHANNEL_CONTEST_UPDATES, (err) => {
          if (err) {
            logger.warn({ err: err.message }, 'Failed to subscribe to Redis contest updates');
          } else {
            this.isSubscribed = true;
            logger.info('Subscribed to Redis contest updates pub/sub channel (Day 19)');
          }
        });
      }
    } catch {}
  }

  private closeAllOnRedisDrop() {
    for (const group of this.clients.values()) {
      for (const client of Array.from(group)) {
        if (client.ready) {
          try {
            client.res.write('event: error\ndata: {"message":"Live stream disconnected"}\n\n');
            client.res.end();
          } catch {}
          client.cleanup();
        }
      }
    }
  }

  private setupRedisSubscriber() {
    if (typeof redisSubscriber.on === 'function') {
      redisSubscriber.on('message', async (channel, message) => {
        if (channel === REDIS_KEYS.CHANNEL_CONTEST_UPDATES) {
          try {
            const parsed = JSON.parse(message) as ContestUpdateEvent;
            if (!parsed || typeof parsed.contestId !== 'string') return;
            await this.broadcastContestUpdate(parsed.contestId);
          } catch (err: any) {
            logger.warn({ err: err?.message }, 'Failed to parse incoming contest update event');
          }
        }
      });

      redisSubscriber.on('ready', () => {
        this.subscribeToEvents();
      });

      redisSubscriber.on('close', () => {
        this.closeAllOnRedisDrop();
      });

      redisSubscriber.on('end', () => {
        this.closeAllOnRedisDrop();
      });
    }

    if (redisSubscriber.status === 'ready') {
      this.subscribeToEvents();
    }
  }

  public registerClient(
    contestId: string,
    res: Response,
    role?: Role,
    userId?: string
  ): ContestSSEClient {
    const client: ContestSSEClient = {
      id: Math.random().toString(36).substring(2, 9),
      contestId,
      role,
      userId,
      res,
      ready: false,
      cleanup: () => {
        this.removeClient(client);
      },
    };

    if (!this.clients.has(contestId)) {
      this.clients.set(contestId, new Set());
    }
    this.clients.get(contestId)!.add(client);

    return client;
  }

  public removeClient(client: ContestSSEClient) {
    const group = this.clients.get(client.contestId);
    if (group) {
      group.delete(client);
      if (group.size === 0) {
        this.clients.delete(client.contestId);
      }
    }
  }

  public async broadcastContestUpdate(contestId: string): Promise<void> {
    const group = this.clients.get(contestId);
    if (!group || group.size === 0) return;

    let publicSnapshot: LeaderboardEntry[] | null = null;
    let adminSnapshot: LeaderboardEntry[] | null = null;

    for (const client of Array.from(group)) {
      if (!client.ready) continue;

      const isAdmin = (client.role || '').toLowerCase() === 'admin';
      let snapshot: LeaderboardEntry[];

      try {
        if (isAdmin) {
          if (!adminSnapshot) {
            adminSnapshot = await contestsService.getContestLeaderboard(contestId, Role.ADMIN);
          }
          snapshot = adminSnapshot;
        } else {
          if (!publicSnapshot) {
            publicSnapshot = await contestsService.getContestLeaderboard(contestId, Role.USER);
          }
          snapshot = publicSnapshot;
        }

        const payload = `event: leaderboard\ndata: ${JSON.stringify({ leaderboard: snapshot })}\n\n`;
        client.res.write(payload);
      } catch (err: any) {
        logger.warn(
          { err: err?.message, contestId, clientId: client.id },
          'Failed delivering contest leaderboard live update'
        );
      }
    }
  }

  public getClientCount(contestId?: string): number {
    if (contestId) {
      return this.clients.get(contestId)?.size ?? 0;
    }
    let total = 0;
    for (const group of this.clients.values()) {
      total += group.size;
    }
    return total;
  }

  public async handleConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
    const contestId = req.params.id;
    if (!isUuid(contestId)) {
      return next(new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404));
    }

    // Verify contest exists in database
    let contestExists = false;
    try {
      const rows = await db
        .select({ id: contests.id })
        .from(contests)
        .where(eq(contests.id, contestId))
        .limit(1);
      contestExists = rows.length > 0;
    } catch (err: any) {
      logger.warn({ err: err?.message }, 'Database error checking contest existence for SSE');
      return next(
        new AppError(ERROR_CODES.INTERNAL_ERROR, 'Failed to connect to contest stream', 500)
      );
    }

    if (!contestExists) {
      return next(new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404));
    }

    // Determine caller role
    const callerRole = req.user?.role as Role | undefined;

    // Ensure Redis pub/sub channel is subscribed
    this.ensureSubscribed();

    // Register client
    const client = this.registerClient(contestId, res, callerRole, req.user?.id);

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    }
    res.write(': connected\n\n');

    let interval: NodeJS.Timeout | null = null;
    let cleanedUp = false;

    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
      this.removeClient(client);
    };
    client.cleanup = cleanup;

    req.on('close', cleanup);
    res.on('close', cleanup);

    // Send initial snapshot
    try {
      const initialLeaderboard = await contestsService.getContestLeaderboard(contestId, callerRole);
      const initPayload = `event: leaderboard\ndata: ${JSON.stringify({
        leaderboard: initialLeaderboard,
      })}\n\n`;
      res.write(initPayload);
      client.ready = true;
    } catch (err: any) {
      logger.warn(
        { err: err?.message, contestId },
        'Failed sending initial contest leaderboard snapshot'
      );
      cleanup();
      return;
    }

    // Keepalive heartbeat every 15s
    interval = setInterval(() => {
      if (cleanedUp) return;
      try {
        res.write(': keepalive\n\n');
      } catch {
        cleanup();
      }
    }, 15000);
  }
}

export const contestSseManager = new ContestSSEManager();
