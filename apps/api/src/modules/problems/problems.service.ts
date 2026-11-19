import crypto from 'crypto';
import { and, arrayContains, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';
import { z } from 'zod';
import {
  UpdateProblemInput,
  Problem,
  ProblemExample,
  ProblemDifficulty,
  ProblemVisibility,
  Role,
  REDIS_KEYS,
  ERROR_CODES,
  createProblemSchema,
  problemExampleSchema,
  queryProblemsSchema,
  updateProblemSchema,
  UserProblemStatus,
} from '@judge/shared';
import { db } from '../../db/index.js';
import {
  problems,
  submissions,
  testCases,
  contests,
  contestProblems,
  type ProblemRecord,
} from '../../db/schema.js';
import { minioService } from '../../config/minio.js';
import { redisClient, isRedisHealthy } from '../../config/redis.js';
import { AppError } from '../../utils/app-error.js';
import { isUuid, mapDatabaseError } from '../../utils/db-error.js';
import { logger } from '../../utils/logger.js';

export interface ProblemAccessCheckInput {
  id: string;
  visibility: ProblemVisibility | string;
  setterId?: string | null;
  isArchived: boolean;
  isPublished?: boolean | null;
}

/**
 * Centralized fail-closed authorization assertion for problem access.
 *
 * Rules:
 * 1. If problem is archived -> 404 NOT_FOUND.
 * 2. Fail closed on missing, null, or invalid visibility values -> 500 INTERNAL_ERROR.
 * 3. If visibility === 'public' -> unconditionally accessible to anyone.
 * 4. If visibility === 'contest_only':
 *    - Allowed if user is ADMIN.
 *    - Allowed if user is the problem's setter.
 *    - If a specific contestId is provided:
 *      * Validates that problem belongs to this contest in database.
 *      * Allowed if user is contest creator.
 *      * Allowed if currentTime >= contest.startTime.
 *      * Otherwise -> 403 CONTEST_NOT_STARTED.
 *    - If NO contestId is provided:
 *      * Allowed if user is the creator of ANY associated contest.
 *      * Otherwise -> 403 CONTEST_NOT_STARTED (requires contest context; never globally released).
 */
export async function assertProblemAccess(
  problem: ProblemAccessCheckInput,
  currentUser?: { id: string; role: Role },
  currentTime: Date = new Date(),
  contestId?: string
): Promise<void> {
  // 1. Archived problems continue returning intended 404
  if (problem.isArchived) {
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
  }

  // Unpublished / draft problems accessible only by creator or admin
  if (problem.isPublished === false) {
    if (
      currentUser?.role === Role.ADMIN ||
      (currentUser && problem.setterId && currentUser.id === problem.setterId)
    ) {
      return;
    }
    throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
  }

  // 2. Fail-closed: validate visibility
  if (!problem.visibility || typeof problem.visibility !== 'string') {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Invalid problem visibility configuration', 500);
  }

  if (
    problem.visibility !== ProblemVisibility.PUBLIC &&
    problem.visibility !== ProblemVisibility.CONTEST_ONLY
  ) {
    throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'Invalid problem visibility configuration', 500);
  }

  // 3. Unrestricted access ONLY when visibility is exactly 'public'
  if (problem.visibility === ProblemVisibility.PUBLIC) {
    return;
  }

  // 4. Contest-only visibility handling
  // Administrator has full access
  if (currentUser?.role === Role.ADMIN) {
    return;
  }

  // Problem setter has full authoring access
  if (currentUser && problem.setterId && currentUser.id === problem.setterId) {
    return;
  }

  // If a contest context is supplied, validate it specifically
  if (contestId) {
    if (!isUuid(contestId)) {
      throw new AppError(
        ERROR_CODES.CONTEST_NOT_STARTED,
        'Contest problem is not accessible before contest start',
        403
      );
    }

    const linkedRows = await db
      .select({
        contestId: contests.id,
        startTime: contests.startTime,
        endTime: contests.endTime,
        createdBy: contests.createdBy,
      })
      .from(contestProblems)
      .innerJoin(contests, eq(contestProblems.contestId, contests.id))
      .where(
        and(eq(contestProblems.problemId, problem.id), eq(contestProblems.contestId, contestId))
      );

    const linkedContest = linkedRows[0];
    if (!linkedContest) {
      // Problem does not belong to this contest
      throw new AppError(
        ERROR_CODES.CONTEST_NOT_STARTED,
        'Contest problem is not accessible before contest start',
        403
      );
    }

    // Contest creator has access
    if (currentUser && currentUser.id === linkedContest.createdBy) {
      return;
    }

    // Contest must be started
    if (currentTime >= linkedContest.startTime) {
      return;
    }

    throw new AppError(
      ERROR_CODES.CONTEST_NOT_STARTED,
      'Contest problem is not accessible before contest start',
      403
    );
  }

  // No contest context supplied.
  // Query all contests associated with this problem to allow contest creator authoring permissions
  const linkedContests = await db
    .select({
      contestId: contests.id,
      startTime: contests.startTime,
      endTime: contests.endTime,
      createdBy: contests.createdBy,
    })
    .from(contestProblems)
    .innerJoin(contests, eq(contestProblems.contestId, contests.id))
    .where(eq(contestProblems.problemId, problem.id));

  // If user created ANY of the linked contests, grant access
  if (currentUser && linkedContests.some((c) => c.createdBy === currentUser.id)) {
    return;
  }

  // Regular users accessing a contest_only problem without a valid contest context
  // must NOT get global access, even if one linked contest has started.
  throw new AppError(
    ERROR_CODES.CONTEST_NOT_STARTED,
    'Contest problem is not accessible without an active contest context',
    403
  );
}

type CreateProblemParams = z.input<typeof createProblemSchema>;
type QueryProblemsParams = z.input<typeof queryProblemsSchema>;

const PROBLEM_DETAIL_TTL_SECONDS = 300;
const PROBLEM_LIST_TTL_SECONDS = 120;

const cursorPayloadSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  rank: z.number().finite().optional(),
});

type CursorPayload = z.infer<typeof cursorPayloadSchema>;

function encodeProblemCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function decodeProblemCursor(rawCursor: string, hasSearch: boolean): CursorPayload {
  let parsedJson: unknown;
  try {
    const decoded = Buffer.from(rawCursor, 'base64url').toString('utf8');
    parsedJson = JSON.parse(decoded);
  } catch {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid pagination cursor', 400);
  }

  const parsed = cursorPayloadSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid pagination cursor', 400);
  }

  if (hasSearch && parsed.data.rank === undefined) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid search pagination cursor', 400);
  }

  return parsed.data;
}

const cachedProblemSchema: z.ZodType<Problem> = z.object({
  id: z.string().uuid(),
  title: z.string(),
  slug: z.string(),
  statement: z.string(),
  description: z.string().optional(),
  difficulty: z.nativeEnum(ProblemDifficulty),
  tags: z.array(z.string()),
  timeLimitMs: z.number(),
  memoryLimitMb: z.number(),
  sampleInput: z.string(),
  sampleExpectedOutput: z.string(),
  visibility: z.nativeEnum(ProblemVisibility),
  inputFormat: z.string().optional(),
  outputFormat: z.string().optional(),
  constraints: z.string().optional(),
  examples: z.array(problemExampleSchema).optional(),
  starterCode: z.record(z.string()).optional(),
  isPublished: z.boolean().optional(),
  setterId: z.string(),
  isArchived: z.boolean(),
  submissionStatus: z.enum(['SOLVED', 'ATTEMPTED', 'UNATTEMPTED']).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const cachedProblemListSchema = z.object({
  items: z.array(cachedProblemSchema),
  nextCursor: z.string().nullable().optional(),
  total: z.number().optional(),
});

export interface DeleteProblemResult {
  deleted: boolean;
  archived: boolean;
  id: string;
}

export class ProblemsService {
  async createProblem(setterId: string, rawInput: CreateProblemParams): Promise<Problem> {
    if (!isUuid(setterId)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid setter user reference', 400);
    }

    const input = createProblemSchema.parse(rawInput);
    const id = crypto.randomUUID();
    const baseSlug = input.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const slug = `${baseSlug || 'problem'}-${id.substring(0, 6)}`;

    // Upload test-case payloads to MinIO/Silo first; track keys for compensation if DB fails.
    const uploadedKeys: string[] = [];
    const testCaseRecords: Array<{
      id: string;
      problemId: string;
      index: number;
      inputKey: string;
      expectedOutputKey: string;
      isHidden: boolean;
    }> = [];

    try {
      if (input.testCases && input.testCases.length > 0) {
        for (let i = 0; i < input.testCases.length; i++) {
          const tc = input.testCases[i];
          const inputKey = `problems/${id}/test_${i}_in.txt`;
          const outputKey = `problems/${id}/test_${i}_out.txt`;

          await minioService.putObject(inputKey, tc.input);
          uploadedKeys.push(inputKey);
          await minioService.putObject(outputKey, tc.expectedOutput);
          uploadedKeys.push(outputKey);

          testCaseRecords.push({
            id: crypto.randomUUID(),
            problemId: id,
            index: i,
            inputKey,
            expectedOutputKey: outputKey,
            isHidden: tc.isHidden ?? true,
          });
        }
      }

      const statementText = input.statement || input.description || '';
      const sampleInput =
        input.sampleInput ||
        (input.examples && input.examples.length > 0 ? input.examples[0].input : '');
      const sampleExpectedOutput =
        input.sampleExpectedOutput ||
        (input.examples && input.examples.length > 0 ? input.examples[0].output : '');

      const created = await db.transaction(async (tx) => {
        const [insertedProblem] = await tx
          .insert(problems)
          .values({
            id,
            title: input.title,
            slug,
            statement: statementText,
            difficulty: input.difficulty,
            tags: input.tags,
            timeLimitMs: input.timeLimitMs,
            memoryLimitMb: input.memoryLimitMb,
            sampleInput,
            sampleExpectedOutput,
            visibility: input.visibility || ProblemVisibility.PUBLIC,
            inputFormat: input.inputFormat || '',
            outputFormat: input.outputFormat || '',
            constraints: input.constraints || '',
            examples: input.examples || [],
            starterCode: input.starterCode || {},
            isPublished: input.isPublished !== undefined ? input.isPublished : true,
            setterId,
            isArchived: false,
          })
          .returning();

        if (testCaseRecords.length > 0) {
          await tx.insert(testCases).values(testCaseRecords);
        }

        return insertedProblem;
      });

      await this.invalidateListCache();
      return this.mapToDto(created);
    } catch (err) {
      if (uploadedKeys.length > 0) {
        await minioService.deleteObjects(uploadedKeys);
      }
      throw mapDatabaseError(err, {
        uniqueViolation: 'A problem with this slug already exists',
        foreignKeyViolation: 'Problem setter user does not exist',
      });
    }
  }

  async getProblem(
    idOrSlug: string,
    currentUser?: { id: string; role: Role },
    currentTime: Date = new Date(),
    contestId?: string
  ): Promise<Problem> {
    const cacheKey = REDIS_KEYS.PROBLEM_CACHE(idOrSlug);

    // 1. Cache-aside read (Redis) - ONLY serve public problems directly from unauthenticated cache
    if (isRedisHealthy()) {
      try {
        const cached = await redisClient.get(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as Partial<Problem>;
          if (
            parsed &&
            typeof parsed.id === 'string' &&
            typeof parsed.title === 'string' &&
            parsed.visibility === ProblemVisibility.PUBLIC
          ) {
            return parsed as Problem;
          }
          await redisClient.del(cacheKey);
        }
      } catch (err) {
        logger.warn(
          { cacheKey, err: err instanceof Error ? err.message : 'unknown' },
          'Redis problem detail cache read failed; falling back to PostgreSQL'
        );
        await this.safeDeleteKey(cacheKey);
      }
    }

    // 2. Query PostgreSQL
    let problem: ProblemRecord | undefined;
    try {
      const lookupFilter = isUuid(idOrSlug)
        ? or(eq(problems.id, idOrSlug), eq(problems.slug, idOrSlug))
        : eq(problems.slug, idOrSlug);

      const rows = await db
        .select()
        .from(problems)
        .where(and(lookupFilter, eq(problems.isArchived, false)))
        .limit(1);
      problem = rows[0];
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!problem) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    // Centralized access authorization check
    await assertProblemAccess(problem, currentUser, currentTime, contestId);

    // Hidden tests, MinIO keys, and credentials never appear in problem API responses.
    const dto = this.mapToDto(problem);

    // 3. Populate cache with TTL (ONLY public problems are cached in public Redis key)
    const isPublic = problem.visibility === ProblemVisibility.PUBLIC;
    if (isRedisHealthy() && isPublic) {
      try {
        await redisClient.set(cacheKey, JSON.stringify(dto), 'EX', PROBLEM_DETAIL_TTL_SECONDS);
      } catch (err) {
        logger.warn(
          { cacheKey, err: err instanceof Error ? err.message : 'unknown' },
          'Redis problem detail cache write failed'
        );
      }
    }

    if (currentUser?.id) {
      const [singleStatus] = await this.attachSubmissionStatuses([dto], currentUser.id);
      return singleStatus;
    }

    return {
      ...dto,
      submissionStatus: 'UNATTEMPTED',
    };
  }

  async updateProblem(
    id: string,
    rawInput: UpdateProblemInput,
    currentUser?: { id: string; role: Role }
  ): Promise<Problem> {
    if (!isUuid(id)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    if (currentUser && currentUser.role !== Role.ADMIN) {
      const [existing] = await db
        .select({ setterId: problems.setterId })
        .from(problems)
        .where(and(eq(problems.id, id), eq(problems.isArchived, false)))
        .limit(1);
      if (existing && existing.setterId !== currentUser.id) {
        throw new AppError(
          ERROR_CODES.FORBIDDEN,
          'You do not have permission to update this problem',
          403
        );
      }
    }

    const input = updateProblemSchema.parse(rawInput);

    const patch: Partial<typeof problems.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (input.title !== undefined) patch.title = input.title;
    if (input.statement !== undefined) patch.statement = input.statement;
    else if (input.description !== undefined) patch.statement = input.description;
    if (input.difficulty !== undefined) patch.difficulty = input.difficulty;
    if (input.tags !== undefined) patch.tags = input.tags;
    if (input.timeLimitMs !== undefined) patch.timeLimitMs = input.timeLimitMs;
    if (input.memoryLimitMb !== undefined) patch.memoryLimitMb = input.memoryLimitMb;
    if (input.sampleInput !== undefined) patch.sampleInput = input.sampleInput;
    if (input.sampleExpectedOutput !== undefined) {
      patch.sampleExpectedOutput = input.sampleExpectedOutput;
    }
    if (input.visibility !== undefined) patch.visibility = input.visibility;
    if (input.inputFormat !== undefined) patch.inputFormat = input.inputFormat;
    if (input.outputFormat !== undefined) patch.outputFormat = input.outputFormat;
    if (input.constraints !== undefined) patch.constraints = input.constraints;
    if (input.examples !== undefined) {
      patch.examples = input.examples;
      if (!input.sampleInput && input.examples.length > 0) {
        patch.sampleInput = input.examples[0].input;
      }
      if (!input.sampleExpectedOutput && input.examples.length > 0) {
        patch.sampleExpectedOutput = input.examples[0].output;
      }
    }
    if (input.starterCode !== undefined) patch.starterCode = input.starterCode;
    if (input.isPublished !== undefined) patch.isPublished = input.isPublished;

    let updated: ProblemRecord | undefined;
    try {
      const rows = await db
        .update(problems)
        .set(patch)
        .where(and(eq(problems.id, id), eq(problems.isArchived, false)))
        .returning();
      updated = rows[0];

      if (input.testCases && input.testCases.length > 0) {
        const existingTcs = await db
          .select({ index: testCases.index })
          .from(testCases)
          .where(eq(testCases.problemId, id))
          .orderBy(desc(testCases.index))
          .limit(1);
        const startIndex = existingTcs.length > 0 ? existingTcs[0].index + 1 : 0;
        for (let i = 0; i < input.testCases.length; i++) {
          const tc = input.testCases[i];
          const idx = startIndex + i;
          const inputKey = `problems/${id}/test_${idx}_in.txt`;
          const outputKey = `problems/${id}/test_${idx}_out.txt`;
          await minioService.putObject(inputKey, tc.input);
          await minioService.putObject(outputKey, tc.expectedOutput);
          await db.insert(testCases).values({
            id: crypto.randomUUID(),
            problemId: id,
            index: idx,
            inputKey,
            expectedOutputKey: outputKey,
            isHidden: tc.isHidden ?? true,
          });
        }
      }
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!updated) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    await this.invalidateProblemCaches(id, updated.slug);
    return this.mapToDto(updated);
  }

  async deleteProblem(id: string): Promise<DeleteProblemResult> {
    if (!isUuid(id)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    let outcome: { slug: string; archived: boolean; keysToDelete: string[] } | undefined;

    try {
      outcome = await db.transaction(async (tx) => {
        const [existing] = await tx
          .select({ id: problems.id, slug: problems.slug, isArchived: problems.isArchived })
          .from(problems)
          .where(eq(problems.id, id))
          .limit(1);

        if (!existing || existing.isArchived) {
          return undefined;
        }

        const existingSub = await tx
          .select({ id: submissions.id })
          .from(submissions)
          .where(eq(submissions.problemId, id))
          .limit(1);

        if (existingSub.length > 0) {
          // Safe archival strategy when submissions reference this problem:
          // preserve submission history and MinIO test-case objects.
          await tx
            .update(problems)
            .set({ isArchived: true, updatedAt: new Date() })
            .where(eq(problems.id, id));
          return { slug: existing.slug, archived: true, keysToDelete: [] };
        }

        const tcRows = await tx
          .select({
            inputKey: testCases.inputKey,
            expectedOutputKey: testCases.expectedOutputKey,
          })
          .from(testCases)
          .where(eq(testCases.problemId, id));

        const keysToDelete = tcRows.flatMap((tc) => [tc.inputKey, tc.expectedOutputKey]);

        await tx.delete(problems).where(eq(problems.id, id));
        return { slug: existing.slug, archived: false, keysToDelete };
      });
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!outcome) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Problem not found', 404);
    }

    // Delete MinIO objects only after confirming DB deletion (and never when archived)
    if (!outcome.archived && outcome.keysToDelete.length > 0) {
      await minioService.deleteObjects(outcome.keysToDelete);
    }

    await this.invalidateProblemCaches(id, outcome.slug);

    return {
      deleted: true,
      archived: outcome.archived,
      id,
    };
  }

  /**
   * Search and filter problems using PostgreSQL full-text search, AND-combined filters,
   * base64url keyset cursor pagination, and versioned Redis cache-aside.
   */
  async listProblems(
    rawParams: QueryProblemsParams,
    userId?: string
  ): Promise<{ items: Problem[]; nextCursor: string | null; total?: number }> {
    const params = queryProblemsSchema.parse(rawParams);
    const limit = params.limit || 20;
    const searchText = params.search?.trim() || '';
    const hasSearch = searchText.length > 0;

    const cursorPayload = params.cursor ? decodeProblemCursor(params.cursor, hasSearch) : null;

    // 1. Try versioned Redis list cache
    const listCacheKey = await this.buildListCacheKey({
      search: searchText,
      difficulty: params.difficulty,
      tag: params.tag,
      category: params.category,
      cursor: params.cursor,
      limit,
    });

    if (listCacheKey && isRedisHealthy()) {
      try {
        const cached = await redisClient.get(listCacheKey);
        if (cached) {
          const parsed = JSON.parse(cached) as unknown;
          const cacheParseResult = cachedProblemListSchema.safeParse(parsed);
          if (cacheParseResult.success) {
            const cachePayload = cacheParseResult.data;
            const rawItems = cachePayload.items;
            const itemsWithStatus = await this.attachSubmissionStatuses(rawItems, userId);
            const total =
              typeof cachePayload.total === 'number' && Number.isFinite(cachePayload.total)
                ? cachePayload.total
                : rawItems.length;

            return {
              items: itemsWithStatus,
              nextCursor: cachePayload.nextCursor ?? null,
              total,
            };
          }

          logger.warn(
            { listCacheKey, issues: cacheParseResult.error.issues },
            'Redis problem list cache schema validation failed; purging key and falling back to PostgreSQL'
          );
          await this.safeDeleteKey(listCacheKey);
        }
      } catch (err) {
        logger.warn(
          { listCacheKey, err: err instanceof Error ? err.message : 'unknown' },
          'Redis problem list cache read failed; falling back to PostgreSQL'
        );
        await this.safeDeleteKey(listCacheKey);
      }
    }

    // 2. Build parameterized PostgreSQL WHERE conditions (strict AND semantics)
    // Only public and published problems appear in the public catalog listing/search.
    const conditions: SQL[] = [
      eq(problems.isArchived, false),
      eq(problems.visibility, ProblemVisibility.PUBLIC),
      eq(problems.isPublished, true),
    ];

    if (params.difficulty) {
      conditions.push(eq(problems.difficulty, params.difficulty));
    }

    if (params.tag) {
      conditions.push(arrayContains(problems.tags, [params.tag]));
    }

    if (params.category) {
      conditions.push(arrayContains(problems.tags, [params.category]));
    }

    const tsvectorExpr = sql`to_tsvector('english', coalesce(${problems.title}, '') || ' ' || coalesce(${problems.statement}, ''))`;
    const tsqueryExpr = hasSearch ? sql`websearch_to_tsquery('english', ${searchText})` : null;
    const rankExpr = tsqueryExpr
      ? sql<number>`ts_rank(${tsvectorExpr}, ${tsqueryExpr})::float8`
      : null;

    if (tsqueryExpr) {
      conditions.push(sql`${tsvectorExpr} @@ ${tsqueryExpr}`);
    }

    let total = 0;
    try {
      const [countRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(problems)
        .where(and(...conditions));
      total = countRow?.count ?? 0;
    } catch {
      total = 0;
    }

    if (cursorPayload) {
      const cursorDate = new Date(cursorPayload.createdAt);
      if (hasSearch && rankExpr && cursorPayload.rank !== undefined) {
        const cursorRank = cursorPayload.rank;
        const keysetCond = or(
          sql`${rankExpr} < ${cursorRank}`,
          and(sql`${rankExpr} = ${cursorRank}`, lt(problems.createdAt, cursorDate)),
          and(
            sql`${rankExpr} = ${cursorRank}`,
            eq(problems.createdAt, cursorDate),
            lt(problems.id, cursorPayload.id)
          )
        );
        if (keysetCond) conditions.push(keysetCond);
      } else {
        const keysetCond = or(
          lt(problems.createdAt, cursorDate),
          and(eq(problems.createdAt, cursorDate), lt(problems.id, cursorPayload.id))
        );
        if (keysetCond) conditions.push(keysetCond);
      }
    }

    let result: { items: Problem[]; nextCursor: string | null; total: number };

    try {
      if (hasSearch && rankExpr) {
        const rows = await db
          .select({
            problem: problems,
            rank: rankExpr,
          })
          .from(problems)
          .where(and(...conditions))
          .orderBy(desc(rankExpr), desc(problems.createdAt), desc(problems.id))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const lastEntry = page[page.length - 1];

        result = {
          items: page.map((entry) => this.mapToDto(entry.problem)),
          nextCursor:
            hasMore && lastEntry
              ? encodeProblemCursor({
                  id: lastEntry.problem.id,
                  createdAt: lastEntry.problem.createdAt.toISOString(),
                  rank: Number(lastEntry.rank),
                })
              : null,
          total,
        };
      } else {
        const rows = await db
          .select()
          .from(problems)
          .where(and(...conditions))
          .orderBy(desc(problems.createdAt), desc(problems.id))
          .limit(limit + 1);

        const hasMore = rows.length > limit;
        const page = hasMore ? rows.slice(0, limit) : rows;
        const lastItem = page[page.length - 1];

        result = {
          items: page.map((p) => this.mapToDto(p)),
          nextCursor:
            hasMore && lastItem
              ? encodeProblemCursor({
                  id: lastItem.id,
                  createdAt: lastItem.createdAt.toISOString(),
                })
              : null,
          total,
        };
      }
    } catch (err) {
      throw mapDatabaseError(err);
    }

    // 3. Populate list cache with TTL (without user-specific submission status)
    if (listCacheKey && isRedisHealthy()) {
      try {
        await redisClient.set(listCacheKey, JSON.stringify(result), 'EX', PROBLEM_LIST_TTL_SECONDS);
      } catch (err) {
        logger.warn(
          { listCacheKey, err: err instanceof Error ? err.message : 'unknown' },
          'Redis problem list cache write failed'
        );
      }
    }

    const itemsWithStatus = await this.attachSubmissionStatuses(result.items, userId);
    return {
      ...result,
      items: itemsWithStatus,
    };
  }

  private async attachSubmissionStatuses(items: Problem[], userId?: string): Promise<Problem[]> {
    if (!userId || !isUuid(userId) || items.length === 0) {
      return items.map((it) => ({
        ...it,
        submissionStatus: it.submissionStatus ?? 'UNATTEMPTED',
      }));
    }

    try {
      const problemIds = items.map((p) => p.id);
      const statusRows = await db
        .select({
          problemId: submissions.problemId,
          isSolved: sql<boolean>`bool_or(${submissions.verdict} IN ('ACCEPTED', 'AC'))`,
        })
        .from(submissions)
        .where(and(eq(submissions.userId, userId), inArray(submissions.problemId, problemIds)))
        .groupBy(submissions.problemId);

      const statusMap = new Map<string, UserProblemStatus>();
      for (const r of statusRows) {
        statusMap.set(r.problemId, r.isSolved ? 'SOLVED' : 'ATTEMPTED');
      }

      return items.map((it) => ({
        ...it,
        submissionStatus: statusMap.get(it.id) ?? 'UNATTEMPTED',
      }));
    } catch (err) {
      logger.warn({ userId, err }, 'Failed to compute user submission statuses');
      return items.map((it) => ({
        ...it,
        submissionStatus: it.submissionStatus ?? 'UNATTEMPTED',
      }));
    }
  }

  private async getListCacheVersion(): Promise<string> {
    if (!isRedisHealthy()) return '1';
    try {
      const version = await redisClient.get(REDIS_KEYS.PROBLEMS_LIST_VERSION);
      if (!version) {
        await redisClient.set(REDIS_KEYS.PROBLEMS_LIST_VERSION, '1');
        return '1';
      }
      return version;
    } catch {
      return '1';
    }
  }

  private async buildListCacheKey(
    normalizedParams: Record<string, unknown>
  ): Promise<string | null> {
    if (!isRedisHealthy()) return null;
    const version = await this.getListCacheVersion();
    const hash = crypto
      .createHash('sha256')
      .update(JSON.stringify(normalizedParams))
      .digest('hex')
      .slice(0, 24);
    return REDIS_KEYS.PROBLEMS_LIST_CACHE(version, hash);
  }

  private async invalidateListCache(): Promise<void> {
    if (!isRedisHealthy()) return;
    try {
      await redisClient.incr(REDIS_KEYS.PROBLEMS_LIST_VERSION);
    } catch (err) {
      logger.warn(
        { err: err instanceof Error ? err.message : 'unknown' },
        'Failed to increment Redis problem list cache version'
      );
    }
  }

  private async invalidateProblemCaches(id: string, slug: string): Promise<void> {
    if (!isRedisHealthy()) return;
    await Promise.all([
      this.safeDeleteKey(REDIS_KEYS.PROBLEM_CACHE(id)),
      this.safeDeleteKey(REDIS_KEYS.PROBLEM_CACHE(slug)),
      this.invalidateListCache(),
    ]);
  }

  private async safeDeleteKey(key: string): Promise<void> {
    if (!isRedisHealthy()) return;
    try {
      await redisClient.del(key);
    } catch {}
  }

  async listAdminProblems(user: { id: string; role: Role }): Promise<Problem[]> {
    const conditions: SQL[] = [eq(problems.isArchived, false)];

    if (user.role !== Role.ADMIN) {
      conditions.push(eq(problems.setterId, user.id));
    }

    const records = await db
      .select()
      .from(problems)
      .where(and(...conditions))
      .orderBy(desc(problems.createdAt));

    return records.map((p) => this.mapToDto(p));
  }

  private mapToDto(p: ProblemRecord): Problem {
    return {
      id: p.id,
      title: p.title,
      slug: p.slug,
      statement: p.statement,
      description: p.statement,
      difficulty: p.difficulty as ProblemDifficulty,
      tags: p.tags,
      timeLimitMs: p.timeLimitMs,
      memoryLimitMb: p.memoryLimitMb,
      sampleInput: p.sampleInput,
      sampleExpectedOutput: p.sampleExpectedOutput,
      visibility: (p.visibility as ProblemVisibility) || ProblemVisibility.PUBLIC,
      inputFormat: p.inputFormat ?? '',
      outputFormat: p.outputFormat ?? '',
      constraints: p.constraints ?? '',
      examples: (p.examples as ProblemExample[]) ?? [],
      starterCode: p.starterCode ?? {},
      isPublished: p.isPublished ?? true,
      setterId: p.setterId,
      isArchived: p.isArchived,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}

export const problemsService = new ProblemsService();
