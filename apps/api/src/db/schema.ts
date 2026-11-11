import { sql, relations } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  boolean,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';

/**
 * 1. Users table — platform accounts (user, problem_setter, admin).
 */
export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    username: varchar('username', { length: 50 }).notNull().unique(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    passwordHash: varchar('password_hash', { length: 255 }).notNull(),
    role: varchar('role', { length: 20 }).notNull().default('user'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_users_username').on(table.username),
    index('idx_users_email').on(table.email),
  ]
);

/**
 * 2. Problems table — coding challenges created by problem setters/admins.
 */
export const problems = pgTable(
  'problems',
  {
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
    setterId: uuid('setter_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_problems_slug').on(table.slug),
    index('idx_problems_difficulty').on(table.difficulty),
    index('idx_problems_setter_id').on(table.setterId),
    index('idx_problems_created_at_id').on(table.createdAt, table.id),
  ]
);

/**
 * 3. Test cases table — stores MinIO object storage keys (test payloads stay in MinIO).
 */
export const testCases = pgTable(
  'test_cases',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    problemId: uuid('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    index: integer('index').notNull(),
    inputKey: varchar('input_key', { length: 255 }).notNull(),
    expectedOutputKey: varchar('expected_output_key', { length: 255 }).notNull(),
    isHidden: boolean('is_hidden').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_problem_test_index').on(table.problemId, table.index),
    index('idx_test_cases_problem_id').on(table.problemId, table.index),
  ]
);

/**
 * 4. Submissions table — code submissions, execution status, and judge verdicts.
 */
export const submissions = pgTable(
  'submissions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    problemId: uuid('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
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
  },
  (table) => [
    index('idx_submissions_user_cursor').on(table.userId, table.createdAt, table.id),
    index('idx_submissions_problem_status').on(table.problemId, table.status),
    index('idx_submissions_status').on(table.status),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  authoredProblems: many(problems),
  submissions: many(submissions),
}));

export const problemsRelations = relations(problems, ({ one, many }) => ({
  setter: one(users, {
    fields: [problems.setterId],
    references: [users.id],
  }),
  testCases: many(testCases),
  submissions: many(submissions),
}));

export const testCasesRelations = relations(testCases, ({ one }) => ({
  problem: one(problems, {
    fields: [testCases.problemId],
    references: [problems.id],
  }),
}));

export const submissionsRelations = relations(submissions, ({ one }) => ({
  problem: one(problems, {
    fields: [submissions.problemId],
    references: [problems.id],
  }),
  user: one(users, {
    fields: [submissions.userId],
    references: [users.id],
  }),
}));

export type UserRecord = typeof users.$inferSelect;
export type NewUserRecord = typeof users.$inferInsert;
export type ProblemRecord = typeof problems.$inferSelect;
export type NewProblemRecord = typeof problems.$inferInsert;
export type TestCaseRecord = typeof testCases.$inferSelect;
export type NewTestCaseRecord = typeof testCases.$inferInsert;
export type SubmissionRecord = typeof submissions.$inferSelect;
export type NewSubmissionRecord = typeof submissions.$inferInsert;
