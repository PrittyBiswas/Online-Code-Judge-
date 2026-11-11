import { sql } from 'drizzle-orm';
import { pgTable, uuid, varchar, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';

export const problems = pgTable('problems', {
  id: uuid('id').defaultRandom().primaryKey(),
  title: varchar('title', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 255 }).notNull().unique(),
  statement: text('statement').notNull(),
  difficulty: varchar('difficulty', { length: 20 }).notNull().default('medium'),
  tags: text('tags')
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  timeLimitMs: integer('time_limit_ms').notNull().default(2000),
  memoryLimitMb: integer('memory_limit_mb').notNull().default(128),
  sampleInput: text('sample_input').notNull().default(''),
  sampleExpectedOutput: text('sample_expected_output').notNull().default(''),
  setterId: uuid('setter_id').notNull(),
  isArchived: boolean('is_archived').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const testCases = pgTable('test_cases', {
  id: uuid('id').defaultRandom().primaryKey(),
  problemId: uuid('problem_id').notNull(),
  index: integer('index').notNull(),
  inputKey: varchar('input_key', { length: 255 }).notNull(),
  expectedOutputKey: varchar('expected_output_key', { length: 255 }).notNull(),
  isHidden: boolean('is_hidden').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const submissions = pgTable('submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  problemId: uuid('problem_id').notNull(),
  userId: uuid('user_id').notNull(),
  code: text('code').notNull(),
  language: varchar('language', { length: 20 }).notNull().default('javascript'),
  status: varchar('status', { length: 20 }).notNull().default('QUEUED'),
  verdict: varchar('verdict', { length: 30 }),
  executionTimeMs: integer('execution_time_ms'),
  memoryUsedKb: integer('memory_used_kb'),
  failedTestIndex: integer('failed_test_index'),
  retryCount: integer('retry_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ProblemRow = typeof problems.$inferSelect;
export type TestCaseRow = typeof testCases.$inferSelect;
export type SubmissionRow = typeof submissions.$inferSelect;

