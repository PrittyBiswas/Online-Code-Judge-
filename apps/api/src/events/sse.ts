import { Request, Response, Router } from 'express';
import { redisSubscriber, isRedisHealthy } from '../config/redis.js';
import { memoryDb } from '../config/db.js';
import { REDIS_KEYS, SubmissionEvent, SubmissionStatus, Verdict } from '@judge/shared';
import { logger } from '../utils/logger.js';

interface SSEClient {
  id: string;
  submissionId: string;
  res: Response;
}

class SSEManager {
  private clients = new Map<string, Set<SSEClient>>();

  constructor() {
    this.setupRedisSubscriber();
  }

  private setupRedisSubscriber() {
    if (isRedisHealthy()) {
      try {
        redisSubscriber.subscribe(REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS, (err) => {
          if (err) {
            logger.warn({ err: err.message }, 'Failed to subscribe to Redis submission events');
          } else {
            logger.info('Subscribed to Redis submission events pub/sub channel (AC-LV-02)');
          }
        });

        redisSubscriber.on('message', (channel, message) => {
          if (channel === REDIS_KEYS.CHANNEL_SUBMISSION_EVENTS) {
            try {
              const event: SubmissionEvent = JSON.parse(message);
              this.broadcast(event);
            } catch (err: any) {
              logger.warn({ err: err.message }, 'Failed to parse incoming SSE Redis event');
            }
          }
        });
      } catch {}
    }
  }

  public register(submissionId: string, res: Response): SSEClient {
    const client: SSEClient = {
      id: Math.random().toString(36).substring(2, 9),
      submissionId,
      res,
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

  public broadcast(event: SubmissionEvent) {
    const group = this.clients.get(event.submissionId);
    if (!group || group.size === 0) return;

    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const client of group) {
      try {
        client.res.write(payload);
        // If final verdict received, end connection cleanly (AC-LV-04)
        if (event.verdict) {
          client.res.end();
          this.remove(client);
        }
      } catch {
        this.remove(client);
      }
    }
  }
}

export const sseManager = new SSEManager();

export const sseRouter = Router();

/**
 * SSE Endpoint for Live Updates on a Submission (AC-LV-01..04, EC-09)
 */
sseRouter.get('/:id/live', (req: Request, res: Response) => {
  const submissionId = req.params.id;

  // Set SSE Headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  res.write(': connected\n\n');

  // Immediately check current state in DB (catch-up / reconnect handling AC-LV-03 & EC-09)
  const currentSub = memoryDb.submissions.get(submissionId);
  if (currentSub) {
    const initEvent: SubmissionEvent = {
      submissionId,
      status: (currentSub.status as any) || SubmissionStatus.QUEUED,
      verdict: (currentSub.verdict as Verdict) || undefined,
      failedTestIndex: currentSub.failed_test_index || undefined,
      executionTimeMs: currentSub.execution_time_ms || undefined,
      memoryUsedKb: currentSub.memory_used_kb || undefined,
      timestamp: Date.now(),
    };

    res.write(`data: ${JSON.stringify(initEvent)}\n\n`);

    // If already finished, terminate immediately (EC-09)
    if (currentSub.verdict) {
      res.end();
      return;
    }
  }

  const client = sseManager.register(submissionId, res);

  // Periodic keepalive ping
  const interval = setInterval(() => {
    res.write(': keepalive\n\n');
  }, 15000);

  req.on('close', () => {
    clearInterval(interval);
    sseManager.remove(client); // AC-LV-04: No leaked connections
  });
});

