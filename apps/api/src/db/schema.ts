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
  primaryKey,
  check,
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
    visibility: varchar('visibility', { length: 20 }).notNull().default('public'),
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
    index('idx_problems_visibility').on(table.visibility),
    index('idx_problems_setter_id').on(table.setterId),
    index('idx_problems_created_at_id').on(table.createdAt, table.id),
    index('idx_problems_search_gin').using(
      'gin',
      sql`to_tsvector('english', coalesce(${table.title}, '') || ' ' || coalesce(${table.statement}, ''))`
    ),
    check('chk_problems_visibility', sql`${table.visibility} IN ('public', 'contest_only')`),
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
    contestId: uuid('contest_id').references(() => contests.id, { onDelete: 'set null' }),
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
    index('idx_submissions_contest_problem').on(table.contestId, table.problemId),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  authoredProblems: many(problems),
  submissions: many(submissions),
  contestsCreated: many(contests),
  contestParticipations: many(contestParticipants),
}));

export const problemsRelations = relations(problems, ({ one, many }) => ({
  setter: one(users, {
    fields: [problems.setterId],
    references: [users.id],
  }),
  testCases: many(testCases),
  submissions: many(submissions),
  contestProblems: many(contestProblems),
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
  contest: one(contests, {
    fields: [submissions.contestId],
    references: [contests.id],
  }),
}));

/**
 * 5. Contests table — competitive programming contests.
 */
export const contests = pgTable(
  'contests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    title: varchar('title', { length: 255 }).notNull(),
    description: text('description').notNull().default(''),
    startTime: timestamp('start_time', { withTimezone: true }).notNull(),
    endTime: timestamp('end_time', { withTimezone: true }).notNull(),
    freezeMinutes: integer('freeze_minutes').notNull().default(60),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_contests_times').on(table.startTime, table.endTime),
    index('idx_contests_created_by').on(table.createdBy),
    check('chk_contests_times', sql`${table.startTime} < ${table.endTime}`),
    check('chk_contests_freeze_minutes', sql`${table.freezeMinutes} >= 0`),
  ]
);

/**
 * 6. Contest problems table — problems associated with a contest in deterministic order.
 */
export const contestProblems = pgTable(
  'contest_problems',
  {
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    problemId: uuid('problem_id')
      .notNull()
      .references(() => problems.id, { onDelete: 'cascade' }),
    problemOrder: integer('problem_order').notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.contestId, table.problemId], name: 'pk_contest_problems' }),
    index('idx_contest_problems_order').on(table.contestId, table.problemOrder),
    index('idx_contest_problems_problem_id').on(table.problemId),
    check('chk_contest_problems_order', sql`${table.problemOrder} > 0`),
  ]
);

/**
 * 7. Contest participants table — user registrations for contests.
 */
export const contestParticipants = pgTable(
  'contest_participants',
  {
    contestId: uuid('contest_id')
      .notNull()
      .references(() => contests.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    registeredAt: timestamp('registered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.contestId, table.userId], name: 'pk_contest_participants' }),
    index('idx_contest_participants_user_id').on(table.userId),
    index('idx_contest_participants_contest_id').on(table.contestId),
  ]
);

export const contestsRelations = relations(contests, ({ one, many }) => ({
  creator: one(users, {
    fields: [contests.createdBy],
    references: [users.id],
  }),
  contestProblems: many(contestProblems),
  participants: many(contestParticipants),
  submissions: many(submissions),
}));

export const contestProblemsRelations = relations(contestProblems, ({ one }) => ({
  contest: one(contests, {
    fields: [contestProblems.contestId],
    references: [contests.id],
  }),
  problem: one(problems, {
    fields: [contestProblems.problemId],
    references: [problems.id],
  }),
}));

export const contestParticipantsRelations = relations(contestParticipants, ({ one }) => ({
  contest: one(contests, {
    fields: [contestParticipants.contestId],
    references: [contests.id],
  }),
  user: one(users, {
    fields: [contestParticipants.userId],
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
export type ContestRecord = typeof contests.$inferSelect;
export type NewContestRecord = typeof contests.$inferInsert;
export type ContestProblemRecord = typeof contestProblems.$inferSelect;
export type NewContestProblemRecord = typeof contestProblems.$inferInsert;
export type ContestParticipantRecord = typeof contestParticipants.$inferSelect;
export type NewContestParticipantRecord = typeof contestParticipants.$inferInsert;
