import { describe, it, expect, vi } from 'vitest';
import { QUEUES } from '@judge/shared';

const { queueConfigs } = vi.hoisted(() => ({
  queueConfigs: new Map<string, Record<string, unknown>>(),
}));

vi.mock('bullmq', () => {
  return {
    Queue: vi.fn((name: string, opts: Record<string, unknown>) => {
      queueConfigs.set(name, opts);
      return { name, opts, on: vi.fn() };
    }),
  };
});

import '../src/config/queue.js';

describe('BullMQ Queue Retention Configuration', () => {
  it('removes completed sample-run jobs immediately and bounds failed jobs to 300s / 50 count', () => {
    const sampleOpts = queueConfigs.get(QUEUES.SAMPLE_RUN) as {
      defaultJobOptions?: Record<string, unknown>;
    };
    expect(sampleOpts?.defaultJobOptions).toEqual({
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: { age: 300, count: 50 },
    });
  });

  it('preserves the official judgeQueue defaultJobOptions unchanged', () => {
    const judgeOpts = queueConfigs.get(QUEUES.JUDGE) as {
      defaultJobOptions?: Record<string, unknown>;
    };
    expect(judgeOpts?.defaultJobOptions).toEqual({
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    });
  });
});
