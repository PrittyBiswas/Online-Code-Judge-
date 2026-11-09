import { z } from 'zod';

export const createContestSchema = z.object({
  title: z.string().min(3).max(120),
  description: z.string().default(''),
  startTime: z.string().datetime({ message: 'Start time must be a valid ISO datetime' }),
  endTime: z.string().datetime({ message: 'End time must be a valid ISO datetime' }),
  freezeMinutes: z.number().int().min(0).default(60),
  problemIds: z.array(z.string().uuid()).min(1, 'Contest must contain at least one problem'),
}).refine((data) => new Date(data.endTime) > new Date(data.startTime), {
  message: 'End time must be after start time',
  path: ['endTime'],
});

export const joinContestSchema = z.object({
  contestId: z.string().uuid(),
});

export type CreateContestInput = z.infer<typeof createContestSchema>;
export type JoinContestInput = z.infer<typeof joinContestSchema>;

