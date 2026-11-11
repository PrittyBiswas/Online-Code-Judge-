import { describe, it, expect, vi } from 'vitest';
import { getTableName, getTableColumns } from 'drizzle-orm';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { users, problems, testCases, submissions } from '../src/db/schema.js';
import { pool, checkDatabaseConnection } from '../src/db/index.js';

describe('Day 4 Drizzle ORM Schema & Connection Safety', () => {
  it('defines the expected PostgreSQL tables and core columns', () => {
    expect(getTableName(users)).toBe('users');
    expect(getTableName(problems)).toBe('problems');
    expect(getTableName(testCases)).toBe('test_cases');
    expect(getTableName(submissions)).toBe('submissions');

    expect(Object.keys(getTableColumns(users))).toEqual(
      expect.arrayContaining([
        'id',
        'username',
        'email',
        'passwordHash',
        'role',
        'createdAt',
        'updatedAt',
      ])
    );
    expect(Object.keys(getTableColumns(problems))).toEqual(
      expect.arrayContaining([
        'id',
        'title',
        'slug',
        'statement',
        'difficulty',
        'setterId',
        'createdAt',
      ])
    );
    expect(Object.keys(getTableColumns(testCases))).toEqual(
      expect.arrayContaining([
        'id',
        'problemId',
        'index',
        'inputKey',
        'expectedOutputKey',
        'isHidden',
      ])
    );
    expect(Object.keys(getTableColumns(submissions))).toEqual(
      expect.arrayContaining(['id', 'problemId', 'userId', 'code', 'language', 'status', 'verdict'])
    );
  });

  it('includes a generated Drizzle Kit migration journal', () => {
    const journalPath = resolve(__dirname, '../../../drizzle/migrations/meta/_journal.json');
    expect(existsSync(journalPath)).toBe(true);
  });

  it('handles database connection failures safely in checkDatabaseConnection()', async () => {
    const querySpy = vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('DB offline'));
    const ok = await checkDatabaseConnection();
    expect(ok).toBe(false);
    querySpy.mockRestore();
  });
});
