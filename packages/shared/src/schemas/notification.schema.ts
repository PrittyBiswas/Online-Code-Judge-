import { z } from 'zod';

export const notificationTypeSchema = z.enum([
  'CONTEST_REGISTERED',
  'CONTEST_APPROACHING',
  'CONTEST_STARTED',
  'CONTEST_SUBMISSION_VERDICT',
  'CONTEST_ENDING_SOON',
  'CONTEST_ENDED',
]);

export const notificationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  unreadOnly: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((val) => val === 'true' || val === '1'),
});

export type NotificationQueryParams = z.infer<typeof notificationQuerySchema>;

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
});

export type ActivityQueryParams = z.infer<typeof activityQuerySchema>;
