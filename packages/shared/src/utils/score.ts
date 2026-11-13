/**
 * Leaderboard Score Encoding / Decoding (Card 6)
 * Encodes "more problems solved ranks higher; ties broken by lower penalty" into a single float
 * suitable for Redis Sorted Sets (ZADD, ZREVRANGE).
 */

export const PENALTY_OFFSET = 10_000_000; // Max penalty capacity (approx 115 days)
export const MAX_PENALTY = PENALTY_OFFSET - 1;

/**
 * Atomic Lua script for recording a first solve in Redis.
 * 1. Validates all inputs before any writes.
 * 2. Checks key types upfront to prevent partial execution errors.
 * 3. Deduplicates solves via SISMEMBER before mutation.
 * 4. Atomically updates the user's score in the leaderboard ZSET.
 * 5. Uses pcall around ZADD with SREM rollback if ZADD fails, ensuring
 *    the solved set and leaderboard never become inconsistent.
 */
export const RECORD_SOLVE_LUA_SCRIPT = `
local solvedSetKey = KEYS[1]
local leaderboardKey = KEYS[2]
local rebuildPointerKey = KEYS[3]
local problemId = ARGV[1]
local userId = ARGV[2]
local penalty = tonumber(ARGV[3])
local offset = tonumber(ARGV[4]) or 10000000
local maxPenalty = offset - 1

-- 1. Validate all arguments BEFORE any mutation
if not problemId or problemId == '' then
  return redis.error_reply('ERR invalid problemId')
end
if not userId or userId == '' then
  return redis.error_reply('ERR invalid userId')
end
if not penalty or penalty ~= penalty then
  return redis.error_reply('ERR invalid penalty')
end

if penalty < 0 then penalty = 0 end
if penalty > maxPenalty then penalty = maxPenalty end

-- 2. Verify key types before mutating any key
local solvedKeyType = redis.call('TYPE', solvedSetKey)['ok']
if solvedKeyType ~= 'set' and solvedKeyType ~= 'none' then
  return redis.error_reply('WRONGTYPE solvedSetKey is not a set')
end

local lbKeyType = redis.call('TYPE', leaderboardKey)['ok']
if lbKeyType ~= 'zset' and lbKeyType ~= 'none' then
  return redis.error_reply('WRONGTYPE leaderboardKey is not a zset')
end

local activeTempKey = nil
if rebuildPointerKey and rebuildPointerKey ~= '' then
  local ptrType = redis.call('TYPE', rebuildPointerKey)['ok']
  if ptrType ~= 'string' and ptrType ~= 'none' then
    return redis.error_reply('WRONGTYPE rebuildPointerKey is not a string')
  end
  if ptrType == 'string' then
    local tKey = redis.call('GET', rebuildPointerKey)
    if tKey and tKey ~= '' and redis.call('EXISTS', tKey) == 1 then
      local tKeyType = redis.call('TYPE', tKey)['ok']
      if tKeyType ~= 'zset' then
        return redis.error_reply('WRONGTYPE tempKey is not a zset')
      end
      activeTempKey = tKey
    end
  end
end

-- 3. Check if user already solved this problem (AC-LB-02)
local isMember = redis.call('SISMEMBER', solvedSetKey, problemId)
if isMember == 1 then
  return 0
end

-- 4. Calculate new score BEFORE mutating anything
local rawScore = redis.call('ZSCORE', leaderboardKey, userId)
local currentScore = 0
if rawScore then
  currentScore = tonumber(rawScore) or 0
end

local problemsSolved = 0
local totalPenalty = 0
if currentScore > 0 then
  problemsSolved = math.floor(currentScore / offset)
  local remainder = currentScore % offset
  totalPenalty = maxPenalty - remainder
  if totalPenalty < 0 then totalPenalty = 0 end
end

local newSolved = problemsSolved + 1
local newTotalPenalty = totalPenalty + penalty
if newTotalPenalty > maxPenalty then newTotalPenalty = maxPenalty end
local newScore = newSolved * offset + (maxPenalty - newTotalPenalty)

-- 5. Atomic mutations with rollback protection via pcall
local saddOk, saddErr = pcall(redis.call, 'SADD', solvedSetKey, problemId)
if not saddOk then
  return redis.error_reply(tostring(saddErr))
end

local zaddOk, zaddErr = pcall(redis.call, 'ZADD', leaderboardKey, newScore, userId)
if not zaddOk then
  -- Rollback SADD so solved set is not left inconsistent
  redis.call('SREM', solvedSetKey, problemId)
  return redis.error_reply(tostring(zaddErr))
end

-- 6. Atomically update temporary rebuild leaderboard if active
if activeTempKey then
  local rawTempScore = redis.call('ZSCORE', activeTempKey, userId)
  local curTempScore = 0
  if rawTempScore then
    curTempScore = tonumber(rawTempScore) or 0
  end
  local tSolved = 0
  local tPenalty = 0
  if curTempScore > 0 then
    tSolved = math.floor(curTempScore / offset)
    local rem = curTempScore % offset
    tPenalty = maxPenalty - rem
    if tPenalty < 0 then tPenalty = 0 end
  end
  local newTSolved = tSolved + 1
  local newTPenalty = tPenalty + penalty
  if newTPenalty > maxPenalty then newTPenalty = maxPenalty end
  local newTScore = newTSolved * offset + (maxPenalty - newTPenalty)

  local tzaddOk, tzaddErr = pcall(redis.call, 'ZADD', activeTempKey, newTScore, userId)
  if not tzaddOk then
    -- Compensate: rollback canonical ZADD and solved set SADD
    if currentScore > 0 then
      redis.call('ZADD', leaderboardKey, currentScore, userId)
    else
      redis.call('ZREM', leaderboardKey, userId)
    end
    redis.call('SREM', solvedSetKey, problemId)
    return redis.error_reply(tostring(tzaddErr))
  end

  local tsaddOk, tsaddErr = pcall(redis.call, 'SADD', activeTempKey .. ':livesolves:' .. userId, problemId)
  if not tsaddOk then
    -- Compensate: rollback temp ZADD, canonical ZADD, and solved set SADD
    if rawTempScore then
      redis.call('ZADD', activeTempKey, tonumber(rawTempScore), userId)
    else
      redis.call('ZREM', activeTempKey, userId)
    end
    if currentScore > 0 then
      redis.call('ZADD', leaderboardKey, currentScore, userId)
    else
      redis.call('ZREM', leaderboardKey, userId)
    end
    redis.call('SREM', solvedSetKey, problemId)
    return redis.error_reply(tostring(tsaddErr))
  end
end

return 1
`;

/**
 * Atomic Lua script for reconciling a user's solved set during leaderboard rebuilds.
 * Atomically checks the DB snapshot valid problems (ARGV) AND live solves recorded in Redis (KEYS[2]).
 * Prunes stale problem IDs using SREM without race conditions against concurrent live solves.
 *
 * KEYS[1] = judge:user:<userId>:solved
 * KEYS[2] = <tempLeaderboardKey>:livesolves:<userId>
 * ARGV    = valid problem IDs from PostgreSQL snapshot
 */
export const RECONCILE_USER_SOLVED_SET_LUA_SCRIPT = `
local solvedSetKey = KEYS[1]
local liveSolvesKey = KEYS[2]

local valid = {}
for i = 1, #ARGV do
  valid[ARGV[i]] = true
  redis.call('SADD', solvedSetKey, ARGV[i])
end

local hasLiveKey = redis.call('EXISTS', liveSolvesKey)
if hasLiveKey == 1 then
  local liveSolves = redis.call('SMEMBERS', liveSolvesKey)
  for i = 1, #liveSolves do
    valid[liveSolves[i]] = true
    redis.call('SADD', solvedSetKey, liveSolves[i])
  end
end

local hasSolvedKey = redis.call('EXISTS', solvedSetKey)
if hasSolvedKey == 1 then
  local currentMembers = redis.call('SMEMBERS', solvedSetKey)
  for i = 1, #currentMembers do
    local prob = currentMembers[i]
    if not valid[prob] then
      redis.call('SREM', solvedSetKey, prob)
    end
  end
  local remaining = redis.call('SCARD', solvedSetKey)
  if remaining == 0 then
    redis.call('DEL', solvedSetKey)
  end
end

return 1
`;

/**
 * Atomic Lua script for promoting rebuilt temporary leaderboard to canonical leaderboard.
 * Atomically renames tempLeaderboardKey to target canonical key AND deletes the
 * rebuilding pointer in the SAME atomic operation, eliminating any race window
 * where a concurrent solve could recreate an orphaned temporary key.
 *
 * KEYS[1] = tempLeaderboardKey
 * KEYS[2] = canonicalLeaderboardKey (judge:leaderboard:global)
 * KEYS[3] = rebuildingPointerKey (judge:leaderboard:rebuilding)
 */
export const SWAP_LEADERBOARD_KEYS_LUA_SCRIPT = `
local tempKey = KEYS[1]
local canonicalKey = KEYS[2]
local rebuildPointerKey = KEYS[3]

if redis.call('EXISTS', tempKey) == 1 then
  redis.call('RENAME', tempKey, canonicalKey)
end
redis.call('DEL', rebuildPointerKey)

return 1
`;

/**
 * Atomic Lua script for applying a live first solve to the temporary leaderboard
 * currently being assembled during a rebuild.
 *
 * KEYS[1] = activeTempKey
 * ARGV[1] = userId
 * ARGV[2] = penalty
 * ARGV[3] = offset
 */
export const DUAL_WRITE_REBUILD_LUA_SCRIPT = `
local tempKey = KEYS[1]
local canonicalKey = KEYS[2]
local userId = ARGV[1]
local penalty = tonumber(ARGV[2]) or 0
local offset = tonumber(ARGV[3]) or 10000000
local maxPenalty = offset - 1

local targetKey = tempKey
if redis.call('EXISTS', tempKey) == 0 then
  -- Rebuild publication has already occurred (tempKey swapped/deleted).
  -- Prevent recreating an orphaned temporary key; route update to canonicalKey if provided.
  if canonicalKey and canonicalKey ~= '' and redis.call('EXISTS', canonicalKey) == 1 then
    targetKey = canonicalKey
  else
    return 0
  end
end

local rawScore = redis.call('ZSCORE', targetKey, userId)
local currentScore = 0
if rawScore then
  currentScore = tonumber(rawScore) or 0
end

local problemsSolved = 0
local totalPenalty = 0
if currentScore > 0 then
  problemsSolved = math.floor(currentScore / offset)
  local remainder = currentScore % offset
  totalPenalty = maxPenalty - remainder
  if totalPenalty < 0 then totalPenalty = 0 end
end

local newSolved = problemsSolved + 1
local newTotalPenalty = totalPenalty + penalty
if newTotalPenalty > maxPenalty then newTotalPenalty = maxPenalty end
local newScore = newSolved * offset + (maxPenalty - newTotalPenalty)

redis.call('ZADD', targetKey, newScore, userId)
return 1
`;

export function encodeLeaderboardScore(
  problemsSolved: number,
  totalPenaltySeconds: number
): number {
  const boundedPenalty = Math.min(Math.max(0, totalPenaltySeconds), MAX_PENALTY);
  return problemsSolved * PENALTY_OFFSET + (MAX_PENALTY - boundedPenalty);
}

export function decodeLeaderboardScore(score: number): {
  problemsSolved: number;
  totalPenaltySeconds: number;
} {
  if (!Number.isFinite(score) || score <= 0) {
    return { problemsSolved: 0, totalPenaltySeconds: 0 };
  }
  const problemsSolved = Math.floor(score / PENALTY_OFFSET);
  const remainder = score % PENALTY_OFFSET;
  const totalPenaltySeconds = MAX_PENALTY - remainder;
  return {
    problemsSolved,
    totalPenaltySeconds: Math.max(0, totalPenaltySeconds),
  };
}

/**
 * Timezone helpers (Part 1 Core Definitions: "Store UTC; display and schedule contests in IST")
 */
export function formatIST(dateInput: Date | string | number): string {
  const date = new Date(dateInput);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  }).format(date);
}

export function toUTC(dateInput: Date | string | number): string {
  return new Date(dateInput).toISOString();
}
