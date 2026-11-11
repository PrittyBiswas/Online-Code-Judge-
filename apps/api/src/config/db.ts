import { UserRow, ProblemRow, TestCaseRow, SubmissionRow, ContestRow } from '../types/db.js';
import { checkDatabaseConnection } from '../db/index.js';

interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
}

/**
 * In-memory test store used for unit tests and offline testing
 */
class MemoryDatabase {
  public users: Map<string, UserRow> = new Map();
  public problems: Map<string, ProblemRow> = new Map();
  public testCases: Map<string, TestCaseRow> = new Map();
  public submissions: Map<string, SubmissionRow> = new Map();
  public contests: Map<string, ContestRow> = new Map();
}

export const memoryDb = new MemoryDatabase();

export async function query<T = any>(sql: string, params: any[] = []): Promise<QueryResult<T>> {
  // If we have a live postgres client configured, we can route here
  // For standard unit tests and offline dev, memoryDb provides the ACID model
  return executeMockSql<T>(sql, params);
}

function executeMockSql<T>(sql: string, params: any[]): QueryResult<T> {
  const normalized = sql.trim().toLowerCase();

  // Simple SQL dispatch for local testing
  if (normalized.startsWith('insert into users')) {
    const user: UserRow = {
      id: params[0],
      username: params[1],
      email: params[2],
      password_hash: params[3],
      role: params[4] || 'user',
      created_at: new Date(),
      updated_at: new Date(),
    };
    memoryDb.users.set(user.id, user);
    return { rows: [user as any], rowCount: 1 };
  }

  if (
    normalized.startsWith('select * from users where username =') ||
    normalized.includes('from users where')
  ) {
    const target = params[0]?.toLowerCase();
    const found = Array.from(memoryDb.users.values()).find(
      (u) =>
        u.username.toLowerCase() === target || u.email.toLowerCase() === target || u.id === target
    );
    return { rows: found ? [found as any] : [], rowCount: found ? 1 : 0 };
  }

  if (normalized.startsWith('insert into problems')) {
    const problem: ProblemRow = {
      id: params[0],
      title: params[1],
      slug: params[2],
      statement: params[3],
      difficulty: params[4],
      tags: params[5] || [],
      time_limit_ms: params[6] || 2000,
      memory_limit_mb: params[7] || 128,
      sample_input: params[8] || '',
      sample_expected_output: params[9] || '',
      setter_id: params[10],
      is_archived: false,
      created_at: new Date(),
      updated_at: new Date(),
    };
    memoryDb.problems.set(problem.id, problem);
    return { rows: [problem as any], rowCount: 1 };
  }

  if (normalized.includes('from problems')) {
    const all = Array.from(memoryDb.problems.values()).filter((p) => !p.is_archived);
    return { rows: all as any[], rowCount: all.length };
  }

  if (normalized.startsWith('insert into submissions')) {
    const sub: SubmissionRow = {
      id: params[0],
      problem_id: params[1],
      user_id: params[2],
      code: params[3],
      language: params[4],
      status: 'QUEUED',
      verdict: null,
      execution_time_ms: null,
      memory_used_kb: null,
      failed_test_index: null,
      retry_count: 0,
      created_at: new Date(),
      updated_at: new Date(),
    };
    memoryDb.submissions.set(sub.id, sub);
    return { rows: [sub as any], rowCount: 1 };
  }

  return { rows: [], rowCount: 0 };
}

export async function isDatabaseHealthy(): Promise<boolean> {
  return checkDatabaseConnection();
}
