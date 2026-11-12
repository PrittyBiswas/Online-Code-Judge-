import { NextFunction, Request, Response, Router } from 'express';
import { eq } from 'drizzle-orm';
import { redisSubscriber } from '../config/redis.js';
import { db } from '../db/index.js';
import { submissions } from '../db/schema.js';
import { ERROR_CODES, REDIS_KEYS, SubmissionEvent, SubmissionStatus, Verdict } from '@judge/shared';
import { logger } from '../utils/logger.js';
import { isUuid } from '../utils/db-error.js';
import { requireAuth } from '../middleware/auth.js';
import { AppError } from '../utils/app-error.js';

interface SSEClient {
  id: string;
  submissionId: string;
  res: Response;
  ready: boolean;
  lastRank: number;
  buffer: SubmissionEvent[];
  cleanup: () => void;
}

function getEventRank(event: Pick<SubmissionEvent, 'status' | 'verdict'>): number {
  if (
    event.verdict ||
    event.status === SubmissionStatus.COMPLETED ||
    Object.values(Verdict).includes(event.status as Verdict)
  ) {
    return 2;
  }
  if (event.status === SubmissionStatus.RUNNING) {
    return 1;
  }
  return 0;
}

function sanitizeSubmissionEvent(raw: SubmissionEvent): SubmissionEvent {
  return {
    submissionId: raw.submissionId,
    status: raw.status,
    ...(raw.verdict !== undefined ? { verdict: raw.verdict } : {}),
    ...(raw.failedTestIndex !== undefined ? { failedTestIndex: raw.failedTestIndex } : {}),
    ...(raw.executionTimeMs !== undefined ? { executionTimeMs: raw.executionTimeMs } : {}),
    ...(raw.memoryUsedKb !== undefined ? { memoryUsedKb: raw.memoryUsedKb } : {}),
    timestamp: typeof raw.timestamp === 'number' ? raw.timestamp : Date.now(),
  };
}

class SSEManager {
  private clients = new Map<string, Set<SSEClient>>();

  constructor() {
    this.setupRedisSubscriber();
  }

  private subscribeToEvents() {
    try {
      redisSubscriber.subscribe(REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS, (err) => {
        if (err) {
          logger.warn({ err: err.message }, 'Failed to subscribe to Redis submission events');
        } else {
          logger.info('Subscribed to Redis submission events pub/sub channel (AC-LV-02)');
        }
      });
    } catch {}
  }

  private closeAllNonTerminalOnRedisDrop() {
    for (const group of this.clients.values()) {
      for (const client of Array.from(group)) {
        if (client.ready && client.lastRank < 2) {
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
    redisSubscriber.on('message', (channel, message) => {
      if (channel === REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS) {
        try {
          const parsed = JSON.parse(message) as SubmissionEvent;
          if (!parsed || typeof parsed.submissionId !== 'string') return;
          this.broadcast(sanitizeSubmissionEvent(parsed));
        } catch (err: any) {
          logger.warn({ err: err?.message }, 'Failed to parse incoming SSE Redis event');
        }
      }
    });

    redisSubscriber.on('ready', () => {
      this.subscribeToEvents();
    });

    redisSubscriber.on('close', () => {
      this.closeAllNonTerminalOnRedisDrop();
    });

    redisSubscriber.on('end', () => {
      this.closeAllNonTerminalOnRedisDrop();
    });

    if (redisSubscriber.status === 'ready') {
      this.subscribeToEvents();
    }
  }

  public registerPending(submissionId: string, res: Response): SSEClient {
    const client: SSEClient = {
      id: Math.random().toString(36).substring(2, 9),
      submissionId,
      res,
      ready: false,
      lastRank: -1,
      buffer: [],
      cleanup: () => {
        this.remove(client);
      },
    };

    if (!this.clients.has(submissionId)) {
      this.clients.set(submissionId, new Set());
    }
    this.clients.get(submissionId)!.add(client);

    return client;
  }

  public remove(client: SSEClient) {
    const group = this.clients.get(client.submissionId);
    if (group) {
      group.delete(client);
      if (group.size === 0) {
        this.clients.delete(client.submissionId);
      }
    }
  }

  public deliverToClient(client: SSEClient, rawEvent: SubmissionEvent): boolean {
    const event = sanitizeSubmissionEvent(rawEvent);
    const rank = getEventRank(event);

    // Monotonic guard: ignore stale/older or duplicate non-terminal events
    if (rank < client.lastRank || (rank === client.lastRank && rank < 2)) {
      return false;
    }

    client.lastRank = rank;
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    try {
      client.res.write(payload);
      if (rank >= 2) {
        client.res.end();
        client.cleanup();
        return true;
      }
    } catch {
      client.cleanup();
    }
    return rank >= 2;
  }

  public broadcast(event: SubmissionEvent) {
    const group = this.clients.get(event.submissionId);
    if (!group || group.size === 0) return;

    for (const client of Array.from(group)) {
      if (!client.ready) {
        // Buffer events that arrive while the initial DB snapshot is being fetched
        client.buffer.push(event);
        continue;
      }
      this.deliverToClient(client, event);
    }
  }

  public getClientCount(submissionId?: string): number {
    if (submissionId) {
      return this.clients.get(submissionId)?.size ?? 0;
    }
    let total = 0;
    for (const group of this.clients.values()) {
      total += group.size;
    }
    return total;
  }
}

export const sseManager = new SSEManager();

export const sseRouter = Router();

/**
 * Authenticated, ownership-enforced SSE Endpoint for Live Submission Updates.
 */
sseRouter.get('/:id/live', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  const submissionId = req.params.id;
  if (!isUuid(submissionId)) {
    return next(new AppError(ERROR_CODES.NOT_FOUND, 'Submission not found', 404));
  }

  // Register before querying PostgreSQL so no Redis Pub/Sub events are missed during DB lookup
  const client = sseManager.registerPending(submissionId, res);

  let currentSub:
    | {
        id: string;
        userId: string;
        status: string;
        verdict: string | null;
        failedTestIndex: number | null;
        executionTimeMs: number | null;
        memoryUsedKb: number | null;
      }
    | undefined;

  try {
    const rows = await db
      .select({
        id: submissions.id,
        userId: submissions.userId,
        status: submissions.status,
        verdict: submissions.verdict,
        failedTestIndex: submissions.failedTestIndex,
        executionTimeMs: submissions.executionTimeMs,
        memoryUsedKb: submissions.memoryUsedKb,
      })
      .from(submissions)
      .where(eq(submissions.id, submissionId))
      .limit(1);
    currentSub = rows[0];
  } catch (err: any) {
    sseManager.remove(client);
    logger.warn({ err: err?.message }, 'Failed SSE initial submission lookup');
    return next(new AppError(ERROR_CODES.INTERNAL_ERROR, 'Failed to load submission status', 500));
  }

  if (!currentSub) {
    sseManager.remove(client);
    return next(new AppError(ERROR_CODES.NOT_FOUND, 'Submission not found', 404));
  }

  if (currentSub.userId !== req.user!.id) {
    sseManager.remove(client);
    return next(
      new AppError(ERROR_CODES.FORBIDDEN, 'Access denied: you do not own this submission', 403)
    );
  }

  // Set SSE headers only after auth, existence, and ownership checks succeed
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
    sseManager.remove(client);
  };
  client.cleanup = cleanup;

  req.on('close', cleanup);
  res.on('close', cleanup);

  const initEvent: SubmissionEvent = {
    submissionId,
    status: (currentSub.status as SubmissionStatus) || SubmissionStatus.QUEUED,
    verdict: (currentSub.verdict as Verdict) || undefined,
    failedTestIndex: currentSub.failedTestIndex ?? undefined,
    executionTimeMs: currentSub.executionTimeMs ?? undefined,
    memoryUsedKb: currentSub.memoryUsedKb ?? undefined,
    timestamp: Date.now(),
  };

  const terminatedOnInit = sseManager.deliverToClient(client, initEvent);
  if (terminatedOnInit) {
    return;
  }

  client.ready = true;

  // Flush any events that arrived during the PostgreSQL snapshot query
  while (client.buffer.length > 0 && !cleanedUp) {
    const buffered = client.buffer.shift()!;
    const terminated = sseManager.deliverToClient(client, buffered);
    if (terminated) {
      return;
    }
  }

  // If Redis Pub/Sub is unavailable, close gracefully after delivering snapshot so frontend activates polling fallback
  if (redisSubscriber.status !== 'ready') {
    try {
      res.write('event: error\ndata: {"message":"Live stream unavailable"}\n\n');
      res.end();
    } catch {}
    cleanup();
    return;
  }

  // Periodic keepalive ping
  interval = setInterval(() => {
    if (cleanedUp) return;
    try {
      res.write(': keepalive\n\n');
    } catch {
      cleanup();
    }
  }, 15000);
});
