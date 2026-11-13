import { z } from 'zod';

export const queryLeaderboardSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type QueryLeaderboardInput = z.infer<typeof queryLeaderboardSchema>;
