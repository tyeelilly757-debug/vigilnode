import { getDb } from "../db/sqlite";
import { COVERAGE_TTL_MS } from "./learningHealth";
import { PATTERN_SCORING_VERSION } from "./scoringVersion";

export type IntentLearningMaturityRow = {
  sampleDepth: number;
  patternDiversity: number;
};

/** Human-readable bucket for dashboard copy (`low` | `medium` | `high`). */
export function confidenceMaturityLabel(c: number): "low" | "medium" | "high" {
  if (!Number.isFinite(c)) return "low";
  const x = Math.max(0, Math.min(1, c));
  if (x < 0.3) return "low";
  if (x < 0.7) return "medium";
  return "high";
}

function fetchIntentLearningMaturityFromDb(): Record<string, IntentLearningMaturityRow> {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT intent,
              COUNT(*) AS sample_rows,
              COUNT(DISTINCT pattern_id) AS pattern_diversity
       FROM pattern_results
       WHERE scoring_version = ? AND intent IS NOT NULL AND TRIM(intent) != ''
       GROUP BY intent`,
    )
    .all(PATTERN_SCORING_VERSION) as Array<{
    intent: string;
    sample_rows: number;
    pattern_diversity: number;
  }>;
  const out: Record<string, IntentLearningMaturityRow> = {};
  for (const r of rows) {
    if (!r.intent) continue;
    const sampleDepth = Number.isFinite(r.sample_rows) ? Math.max(0, Math.floor(r.sample_rows)) : 0;
    const patternDiversity = Number.isFinite(r.pattern_diversity)
      ? Math.max(0, Math.floor(r.pattern_diversity))
      : 0;
    out[r.intent] = { sampleDepth, patternDiversity };
  }
  return out;
}

let cachedMaturity: Record<string, IntentLearningMaturityRow> | null = null;
let cachedAt = 0;

/** Call after `pattern_results` writes (see `writeHooks`); mirrors coverage cache invalidation. */
export function invalidateIntentSampleDepthCache(): void {
  cachedMaturity = null;
  cachedAt = 0;
}

/**
 * Per-intent maturity for current scoring version — **cached** with the same TTL as learning coverage.
 * - `sampleDepth`: row count (statistical depth)
 * - `patternDiversity`: distinct `pattern_id` (exploration breadth)
 */
export function getIntentLearningMaturityCached(): Record<string, IntentLearningMaturityRow> {
  const now = Date.now();
  if (cachedMaturity !== null && now - cachedAt < COVERAGE_TTL_MS) {
    return cachedMaturity;
  }
  const fresh = fetchIntentLearningMaturityFromDb();
  cachedMaturity = fresh;
  cachedAt = now;
  return fresh;
}
