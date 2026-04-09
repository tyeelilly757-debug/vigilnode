import { getDb } from "../db/sqlite";
import { PATTERN_SCORING_VERSION } from "./scoringVersion";

/** Row counts for versioned pattern learning (`currentVersion` matches `PATTERN_SCORING_VERSION`). */
export function getLearningCoverage(): {
  total: number;
  currentVersion: number;
  currentVersionRows: number;
  coverage: number;
} {
  const db = getDb();
  const totalRow = db.prepare(`SELECT COUNT(*) AS c FROM pattern_results`).get() as { c: number };
  const vRow = db
    .prepare(`SELECT COUNT(*) AS c FROM pattern_results WHERE scoring_version = ?`)
    .get(PATTERN_SCORING_VERSION) as { c: number };
  const total = totalRow.c;
  const currentVersionRows = vRow.c;
  let coverage = total > 0 ? Math.round((currentVersionRows / total) * 1000) / 1000 : 0;
  if (!Number.isFinite(coverage)) coverage = 0;
  return {
    total,
    currentVersion: PATTERN_SCORING_VERSION,
    currentVersionRows,
    coverage,
  };
}

const _ttlEnv = Number(process.env.LEARNING_COVERAGE_TTL_MS);

/** How long `getLearningCoverageCached` reuses the last DB snapshot (ms). Override with `LEARNING_COVERAGE_TTL_MS`. */
export const COVERAGE_TTL_MS =
  Number.isFinite(_ttlEnv) && _ttlEnv >= 0 ? _ttlEnv : 5000;

let cachedCoverage: ReturnType<typeof getLearningCoverage> | null = null;
let cachedAt = 0;
let learningCoverageCacheHits = 0;
let learningCoverageCacheMisses = 0;
let cacheStatsResetAtMs = Date.now();

/** Call after writes to `pattern_results` so the next cached read sees new v3 counts without waiting for TTL. */
export function invalidateLearningCoverageCache(): void {
  cachedCoverage = null;
  cachedAt = 0;
}

/** Counters for `getLearningCoverageCached` (hot-path diagnostics). */
export function getLearningCoverageCacheStats(): {
  hits: number;
  misses: number;
  ttlMs: number;
  hitRate: number;
  lastResetAtMs: number;
} {
  const total = learningCoverageCacheHits + learningCoverageCacheMisses;
  const hitRateRaw = total > 0 ? learningCoverageCacheHits / total : 0;
  return {
    hits: learningCoverageCacheHits,
    misses: learningCoverageCacheMisses,
    ttlMs: COVERAGE_TTL_MS,
    hitRate: Math.round(hitRateRaw * 1000) / 1000,
    lastResetAtMs: cacheStatsResetAtMs,
  };
}

/** Reset hit/miss counters (ops, load tests, TTL experiments). Does not clear cached coverage. */
export function resetLearningCoverageCacheStats(): void {
  learningCoverageCacheHits = 0;
  learningCoverageCacheMisses = 0;
  cacheStatsResetAtMs = Date.now();
}

/**
 * Cached snapshot of learning coverage — use inside hot paths (adaptive engine, intent grouping).
 * `/api/learning/health` should call `getLearningCoverage()` for fresh counts.
 */
export function getLearningCoverageCached(): ReturnType<typeof getLearningCoverage> {
  const now = Date.now();
  if (cachedCoverage !== null && now - cachedAt < COVERAGE_TTL_MS) {
    learningCoverageCacheHits += 1;
    return cachedCoverage;
  }
  learningCoverageCacheMisses += 1;
  const fresh = getLearningCoverage();
  cachedCoverage = fresh;
  cachedAt = now;
  return fresh;
}
