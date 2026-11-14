import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db } from '../../db/index.js';
import {
  contests,
  contestProblems,
  contestParticipants,
  problems as problemsTable,
  submissions as submissionsTable,
  users as usersTable,
  type ContestRecord,
} from '../../db/schema.js';
import {
  CreateContestInput,
  Contest,
  ContestProblemSummary,
  ContestRegistrationResponse,
  ContestUnregistrationResponse,
  LeaderboardEntry,
  Role,
  ERROR_CODES,
  Verdict,
  encodeLeaderboardScore,
} from '@judge/shared';
import { AppError } from '../../utils/app-error.js';
import { isUuid, mapDatabaseError } from '../../utils/db-error.js';
import { type AuthUser } from '../../middleware/auth.js';

export class ContestsService {
  /**
   * Creates a new contest with ordered problem associations in a single PostgreSQL transaction (Phase 3).
   */
  async createContest(creatorId: string, input: CreateContestInput): Promise<Contest> {
    if (!isUuid(creatorId)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid creator user reference', 400);
    }

    if (!input.problemIds || input.problemIds.length === 0) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Contest must contain at least one problem',
        400
      );
    }

    // Reject duplicate problem IDs in input
    const uniqueProblemIds = Array.from(new Set(input.problemIds));
    if (uniqueProblemIds.length !== input.problemIds.length) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Duplicate problem IDs are not allowed in a contest',
        400
      );
    }

    // Verify all problem IDs exist and are not archived
    let foundProblems: Array<{ id: string; isArchived: boolean }>;
    try {
      foundProblems = await db
        .select({
          id: problemsTable.id,
          isArchived: problemsTable.isArchived,
        })
        .from(problemsTable)
        .where(inArray(problemsTable.id, input.problemIds));
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (foundProblems.length !== input.problemIds.length) {
      throw new AppError(
        ERROR_CODES.NOT_FOUND,
        'One or more specified problem IDs do not exist',
        404
      );
    }

    const archivedProblem = foundProblems.find((p) => p.isArchived);
    if (archivedProblem) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Cannot assign archived problems to a contest',
        400
      );
    }

    try {
      const created = await db.transaction(async (tx) => {
        const [insertedContest] = await tx
          .insert(contests)
          .values({
            title: input.title,
            description: input.description || '',
            startTime: new Date(input.startTime),
            endTime: new Date(input.endTime),
            freezeMinutes: input.freezeMinutes ?? 60,
            createdBy: creatorId,
          })
          .returning();

        const contestProblemRows = input.problemIds.map((problemId, index) => ({
          contestId: insertedContest.id,
          problemId,
          problemOrder: index + 1,
        }));

        await tx.insert(contestProblems).values(contestProblemRows);

        return insertedContest;
      });

      return this.mapToDto(created, {
        problemCount: input.problemIds.length,
        participantCount: 0,
        isRegistered: false,
      });
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  /**
   * Lists contests with aggregated participant count, problem count, and user registration status (Phase 4).
   * Executes bulk aggregate queries to completely avoid N+1 query patterns.
   */
  async listContests(currentUserId?: string): Promise<Contest[]> {
    let contestRows: ContestRecord[];
    try {
      contestRows = await db.select().from(contests).orderBy(desc(contests.startTime));
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (contestRows.length === 0) {
      return [];
    }

    const contestIds = contestRows.map((c) => c.id);
    const participantCountMap = new Map<string, number>();
    const problemCountMap = new Map<string, number>();
    const userRegistrations = new Set<string>();

    try {
      const [participantCounts, problemCounts] = await Promise.all([
        db
          .select({
            contestId: contestParticipants.contestId,
            count: sql<number>`count(*)::int`,
          })
          .from(contestParticipants)
          .where(inArray(contestParticipants.contestId, contestIds))
          .groupBy(contestParticipants.contestId),
        db
          .select({
            contestId: contestProblems.contestId,
            count: sql<number>`count(*)::int`,
          })
          .from(contestProblems)
          .where(inArray(contestProblems.contestId, contestIds))
          .groupBy(contestProblems.contestId),
      ]);

      for (const row of participantCounts) {
        participantCountMap.set(row.contestId, Number(row.count));
      }
      for (const row of problemCounts) {
        problemCountMap.set(row.contestId, Number(row.count));
      }

      if (currentUserId && isUuid(currentUserId)) {
        const userRegs = await db
          .select({ contestId: contestParticipants.contestId })
          .from(contestParticipants)
          .where(
            and(
              inArray(contestParticipants.contestId, contestIds),
              eq(contestParticipants.userId, currentUserId)
            )
          );
        for (const r of userRegs) {
          userRegistrations.add(r.contestId);
        }
      }
    } catch (err) {
      throw mapDatabaseError(err);
    }

    return contestRows.map((c) =>
      this.mapToDto(c, {
        participantCount: participantCountMap.get(c.id) || 0,
        problemCount: problemCountMap.get(c.id) || 0,
        isRegistered: userRegistrations.has(c.id),
      })
    );
  }

  /**
   * Retrieves single contest public metadata, problem count, participant count, and registration status (Phase 4).
   */
  async getContest(id: string, currentUserId?: string): Promise<Contest> {
    if (!isUuid(id)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404);
    }

    let contest: ContestRecord | undefined;
    try {
      const rows = await db.select().from(contests).where(eq(contests.id, id)).limit(1);
      contest = rows[0];
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!contest) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404);
    }

    let participantCount = 0;
    let problemCount = 0;
    let isRegistered = false;

    try {
      const [partCountRow, probCountRow] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(contestParticipants)
          .where(eq(contestParticipants.contestId, id)),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(contestProblems)
          .where(eq(contestProblems.contestId, id)),
      ]);

      participantCount = Number(partCountRow[0]?.count || 0);
      problemCount = Number(probCountRow[0]?.count || 0);

      if (currentUserId && isUuid(currentUserId)) {
        isRegistered = await this.isUserRegistered(id, currentUserId);
      }
    } catch (err) {
      throw mapDatabaseError(err);
    }

    return this.mapToDto(contest, {
      participantCount,
      problemCount,
      isRegistered,
    });
  }

  /**
   * Registers an authenticated user for an upcoming contest idempotently (Phase 5).
   * Policy:
   * - Must exist (404).
   * - Must be before startTime.
   * - If already registered, returns existing registration without creating duplicates.
   */
  async registerParticipant(
    contestId: string,
    userId: string
  ): Promise<ContestRegistrationResponse> {
    if (!isUuid(contestId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404);
    }
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid user reference', 400);
    }

    let contest: ContestRecord | undefined;
    try {
      const rows = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);
      contest = rows[0];
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!contest) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404);
    }

    const now = new Date();
    if (now >= contest.startTime) {
      if (now >= contest.endTime) {
        throw new AppError(
          ERROR_CODES.CONTEST_ENDED,
          'Cannot register for a contest that has ended',
          400
        );
      }
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Cannot register for a contest that has already started',
        400
      );
    }

    // Check if user is already registered (idempotent read)
    try {
      const [existing] = await db
        .select()
        .from(contestParticipants)
        .where(
          and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.userId, userId))
        )
        .limit(1);

      if (existing) {
        return {
          registered: true,
          registeredAt: existing.registeredAt.toISOString(),
        };
      }

      // Safe concurrency insert with unique violation fallback
      const [inserted] = await db
        .insert(contestParticipants)
        .values({
          contestId,
          userId,
        })
        .returning();

      return {
        registered: true,
        registeredAt: inserted.registeredAt.toISOString(),
      };
    } catch (err: any) {
      if (err?.cause?.code === '23505' || err?.code === '23505') {
        const [found] = await db
          .select()
          .from(contestParticipants)
          .where(
            and(
              eq(contestParticipants.contestId, contestId),
              eq(contestParticipants.userId, userId)
            )
          )
          .limit(1);

        return {
          registered: true,
          registeredAt: found ? found.registeredAt.toISOString() : new Date().toISOString(),
        };
      }
      throw mapDatabaseError(err);
    }
  }

  /**
   * Unregisters an authenticated user before contest start (Phase 5).
   */
  async unregisterParticipant(
    contestId: string,
    userId: string
  ): Promise<ContestUnregistrationResponse> {
    if (!isUuid(contestId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404);
    }
    if (!isUuid(userId)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Invalid user reference', 400);
    }

    let contest: ContestRecord | undefined;
    try {
      const rows = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);
      contest = rows[0];
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!contest) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404);
    }

    const now = new Date();
    if (now >= contest.startTime) {
      throw new AppError(
        ERROR_CODES.VALIDATION_ERROR,
        'Cannot unregister after contest has started',
        400
      );
    }

    try {
      await db
        .delete(contestParticipants)
        .where(
          and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.userId, userId))
        );

      return { unregistered: true };
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  /**
   * Checks whether a user is registered for a contest.
   */
  async isUserRegistered(contestId: string, userId: string): Promise<boolean> {
    if (!isUuid(contestId) || !isUuid(userId)) {
      return false;
    }

    try {
      const rows = await db
        .select({ contestId: contestParticipants.contestId })
        .from(contestParticipants)
        .where(
          and(eq(contestParticipants.contestId, contestId), eq(contestParticipants.userId, userId))
        )
        .limit(1);

      return rows.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves contest problems with strict time-gating (Phase 6).
   * Policy:
   * - Nonexistent contest -> 404 NOT_FOUND.
   * - Before contest start -> Only ADMIN or contest creator can view. Regular users get 403 CONTEST_NOT_STARTED.
   * - After contest start -> Returns problems in problem_order ASC without hidden test cases or storage keys.
   */
  async getContestProblems(
    contestId: string,
    currentUser?: AuthUser,
    currentTime: Date = new Date()
  ): Promise<ContestProblemSummary[]> {
    if (!isUuid(contestId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404);
    }

    let contest: ContestRecord | undefined;
    try {
      const rows = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);
      contest = rows[0];
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!contest) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404);
    }

    const now = currentTime;
    const isStarted = now >= contest.startTime;
    const isPrivileged =
      currentUser && (currentUser.role === Role.ADMIN || currentUser.id === contest.createdBy);

    if (!isStarted && !isPrivileged) {
      throw new AppError(ERROR_CODES.CONTEST_NOT_STARTED, 'Contest has not started yet', 403);
    }

    try {
      const problemRows = await db
        .select({
          id: problemsTable.id,
          title: problemsTable.title,
          slug: problemsTable.slug,
          difficulty: problemsTable.difficulty,
          problemOrder: contestProblems.problemOrder,
          statement: problemsTable.statement,
          tags: problemsTable.tags,
          timeLimitMs: problemsTable.timeLimitMs,
          memoryLimitMb: problemsTable.memoryLimitMb,
          sampleInput: problemsTable.sampleInput,
          sampleExpectedOutput: problemsTable.sampleExpectedOutput,
        })
        .from(contestProblems)
        .innerJoin(problemsTable, eq(contestProblems.problemId, problemsTable.id))
        .where(and(eq(contestProblems.contestId, contestId), eq(problemsTable.isArchived, false)))
        .orderBy(asc(contestProblems.problemOrder));

      return problemRows.map((r) => ({
        id: r.id,
        title: r.title,
        slug: r.slug,
        difficulty: r.difficulty as any,
        problemOrder: r.problemOrder,
        statement: r.statement,
        tags: r.tags,
        timeLimitMs: r.timeLimitMs,
        memoryLimitMb: r.memoryLimitMb,
        sampleInput: r.sampleInput,
        sampleExpectedOutput: r.sampleExpectedOutput,
      }));
    } catch (err) {
      throw mapDatabaseError(err);
    }
  }

  /**
   * Retrieves contest leaderboard with freeze window enforcement directly from PostgreSQL (Phase 7).
   * - Only counts problems belonging to this contest.
   * - In freeze window: public leaderboard freezes at freezeStartTime while ADMIN sees real-time data.
   * - Scoring formula: first accepted solve per problem; penalty = minutes from contest.startTime.
   */
  async getContestLeaderboard(
    contestId: string,
    callerRole?: Role,
    currentTime: Date = new Date()
  ): Promise<LeaderboardEntry[]> {
    if (!isUuid(contestId)) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404);
    }

    let contest: ContestRecord | undefined;
    try {
      const rows = await db.select().from(contests).where(eq(contests.id, contestId)).limit(1);
      contest = rows[0];
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (!contest) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Contest not found', 404);
    }

    // Retrieve problems assigned to this contest
    let contestProbRows: Array<{ problemId: string }>;
    try {
      contestProbRows = await db
        .select({ problemId: contestProblems.problemId })
        .from(contestProblems)
        .where(eq(contestProblems.contestId, contestId));
    } catch (err) {
      throw mapDatabaseError(err);
    }

    if (contestProbRows.length === 0) {
      return [];
    }

    const contestProblemIds = contestProbRows.map((r) => r.problemId);

    const now = currentTime;
    const freezeStartTime = new Date(contest.endTime.getTime() - contest.freezeMinutes * 60 * 1000);
    const isFreezeWindowActive =
      contest.freezeMinutes > 0 && now >= freezeStartTime && now < contest.endTime;
    const isFrozenForPublic = isFreezeWindowActive && callerRole !== Role.ADMIN;

    let windowSubmissions: Array<{
      userId: string;
      problemId: string;
      verdict: string | null;
      createdAt: Date;
    }> = [];

    try {
      const endBound = isFrozenForPublic
        ? freezeStartTime
        : now < contest.endTime
          ? now
          : contest.endTime;
      windowSubmissions = await db
        .select({
          userId: submissionsTable.userId,
          problemId: submissionsTable.problemId,
          verdict: submissionsTable.verdict,
          createdAt: submissionsTable.createdAt,
        })
        .from(submissionsTable)
        .where(
          and(
            eq(submissionsTable.contestId, contestId),
            inArray(submissionsTable.problemId, contestProblemIds),
            gte(submissionsTable.createdAt, contest.startTime),
            lte(submissionsTable.createdAt, endBound)
          )
        );
    } catch (err) {
      throw mapDatabaseError(err);
    }

    const userStats = new Map<string, { solved: Set<string>; penalty: number }>();
    for (const sub of windowSubmissions) {
      if (sub.verdict === Verdict.ACCEPTED) {
        if (!userStats.has(sub.userId)) {
          userStats.set(sub.userId, { solved: new Set(), penalty: 0 });
        }
        const stat = userStats.get(sub.userId)!;
        if (!stat.solved.has(sub.problemId)) {
          stat.solved.add(sub.problemId);
          const penaltyMinutes = Math.floor(
            (sub.createdAt.getTime() - contest.startTime.getTime()) / 60000
          );
          stat.penalty += Math.max(0, penaltyMinutes);
        }
      }
    }

    const userIds = Array.from(userStats.keys());
    const usernameMap = new Map<string, string>();
    if (userIds.length > 0) {
      try {
        const userRows = await db
          .select({ id: usersTable.id, username: usersTable.username })
          .from(usersTable)
          .where(inArray(usersTable.id, userIds));
        for (const row of userRows) {
          usernameMap.set(row.id, row.username);
        }
      } catch {}
    }

    const entries: LeaderboardEntry[] = [];
    for (const [userId, stat] of userStats.entries()) {
      const score = encodeLeaderboardScore(stat.solved.size, stat.penalty);
      entries.push({
        rank: 0,
        userId,
        username: usernameMap.get(userId) || `Participant_${userId.substring(0, 6)}`,
        problemsSolved: stat.solved.size,
        totalPenaltySeconds: stat.penalty * 60,
        score,
      });
    }

    entries.sort((a, b) => b.score - a.score);
    entries.forEach((e, idx) => {
      e.rank = idx + 1;
    });

    return entries;
  }

  private mapToDto(
    c: ContestRecord,
    extras?: {
      problemCount?: number;
      participantCount?: number;
      isRegistered?: boolean;
    }
  ): Contest {
    const now = new Date();
    const isUpcoming = now < c.startTime;
    const isOpen = now >= c.startTime && now < c.endTime;
    const isEnded = now >= c.endTime;
    const freezeStartTime = new Date(c.endTime.getTime() - c.freezeMinutes * 60 * 1000);
    const isFrozen = now >= freezeStartTime && now < c.endTime;
    const status = isUpcoming ? 'UPCOMING' : isOpen ? 'RUNNING' : 'ENDED';

    return {
      id: c.id,
      title: c.title,
      description: c.description,
      startTime: c.startTime.toISOString(),
      endTime: c.endTime.toISOString(),
      freezeMinutes: c.freezeMinutes,
      createdBy: c.createdBy,
      isOpen,
      isFrozen,
      isEnded,
      status,
      problemCount: extras?.problemCount ?? 0,
      participantCount: extras?.participantCount ?? 0,
      isRegistered: extras?.isRegistered ?? false,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}

export const contestsService = new ContestsService();
