import { getDb } from "../db/sqlite";
import type { SubIntent } from "../domain/subIntent";
import { getLearningCoverageCached } from "./learningHealth";
import { PATTERN_SCORING_VERSION } from "./scoringVersion";

/** Minimum samples per group once warmed; cold-start uses `effectiveIntentMinSamples()`. */
export const INTENT_PATTERN_MIN_SAMPLES = 3;

const LEARNING_COVERAGE_COLD_THRESHOLD = 0.3;
const INTENT_SAMPLES_WHEN_COLD = 5;

/** Stricter `HAVING` during low v3 coverage to avoid exploiting noisy aggregates. */
export function effectiveIntentMinSamples(): number {
  const { coverage, total } = getLearningCoverageCached();
  const cold =
    total === 0 || !Number.isFinite(coverage) || coverage < LEARNING_COVERAGE_COLD_THRESHOLD;
  return cold ? INTENT_SAMPLES_WHEN_COLD : INTENT_PATTERN_MIN_SAMPLES;
}

/** `exp(-ageDays / τ)` — patterns older than ~14d decay. */
export const INTENT_PATTERN_RECENCY_TAU_DAYS = 14;

/** Floor so strong legacy patterns are not zeroed overnight. */
export const INTENT_PATTERN_RECENCY_FLOOR = 0.3;

/** Slight lift when ranking within strict `(intent, sub_intent)` context vs intent-wide pool. */
export const STRICT_SUB_INTENT_SCORE_BOOST = 1.1;

const MS_PER_DAY = 86_400_000;

/** How much we trust an intent-pattern aggregate from sample count alone. */
export function patternConfidenceFromSamples(samples: number): number {
  if (samples >= 20) return 1.0;
  if (samples >= 10) return 0.8;
  if (samples >= 5) return 0.6;
  return 0.4;
}

/** Downweight stale aggregates; `iso` = latest row time for that group. */
export function recencyWeightFromLastSeen(isoDate: string, nowMs: number = Date.now()): number {
  const t = new Date(isoDate).getTime();
  if (!Number.isFinite(t)) return 1;
  const days = Math.max(0, (nowMs - t) / MS_PER_DAY);
  return Math.max(INTENT_PATTERN_RECENCY_FLOOR, Math.exp(-days / INTENT_PATTERN_RECENCY_TAU_DAYS));
}

export type IntentPatternStat = {
  patternId: string;
  avgScore: number;
  samples: number;
  /** Mean graded outcome quality (0–1), from `win_score`. */
  winRate: number;
  confidence: number;
  recencyWeight: number;
  /** Ranking: avgScore × confidence × recency × (0.4 + 1.2 × winRate), optional strict boost. */
  finalScore: number;
  lastSeen: string;
};

type RawGroupRow = {
  patternId: string;
  avgScore: number;
  winRate: number;
  samples: number;
  lastSeen: string;
};

function fetchIntentPatternGroups(intent: string, subIntent: SubIntent | null): RawGroupRow[] {
  if (!intent.trim()) return [];
  const db = getDb();
  const minSamples = effectiveIntentMinSamples();
  const select = `SELECT pattern_id AS patternId, AVG(score) AS avgScore,
       AVG(COALESCE(win_score, CAST(win AS REAL), 0)) AS winRate,
       COUNT(*) AS samples, MAX(created_at) AS lastSeen`;
  if (subIntent !== null) {
    if (subIntent === "generic") {
      return db
        .prepare(
          `${select}
           FROM pattern_results
           WHERE intent = ? AND scoring_version = ?
             AND (sub_intent = 'generic' OR sub_intent IS NULL)
           GROUP BY pattern_id
           HAVING COUNT(*) >= ?`,
        )
        .all(intent, PATTERN_SCORING_VERSION, minSamples) as RawGroupRow[];
    }
    return db
      .prepare(
        `${select}
         FROM pattern_results
         WHERE intent = ? AND sub_intent = ? AND scoring_version = ?
         GROUP BY pattern_id
         HAVING COUNT(*) >= ?`,
      )
      .all(intent, subIntent, PATTERN_SCORING_VERSION, minSamples) as RawGroupRow[];
  }
  return db
    .prepare(
      `${select}
       FROM pattern_results
       WHERE intent = ? AND scoring_version = ?
       GROUP BY pattern_id
       HAVING COUNT(*) >= ?`,
    )
    .all(intent, PATTERN_SCORING_VERSION, minSamples) as RawGroupRow[];
}

function rankIntentGroups(
  rows: RawGroupRow[],
  now: number,
  opts?: { strictSubIntentBoost?: boolean },
): IntentPatternStat[] {
  const boost = opts?.strictSubIntentBoost ? STRICT_SUB_INTENT_SCORE_BOOST : 1;
  const enriched: IntentPatternStat[] = rows.map((r) => {
    const avgScore = Math.round(r.avgScore * 10) / 10;
    const winRate = Math.round(r.winRate * 1000) / 1000;
    const winFactor = 0.4 + 1.2 * winRate;
    const confidence = patternConfidenceFromSamples(r.samples);
    const recencyWeight = recencyWeightFromLastSeen(r.lastSeen, now);
    const finalScore =
      Math.round(avgScore * confidence * recencyWeight * winFactor * boost * 10) / 10;
    return {
      patternId: r.patternId,
      avgScore,
      samples: r.samples,
      winRate,
      confidence,
      recencyWeight: Math.round(recencyWeight * 1000) / 1000,
      finalScore,
      lastSeen: r.lastSeen,
    };
  });
  enriched.sort((a, b) => b.finalScore - a.finalScore);
  return enriched;
}

/**
 * Top prompt fingerprints for a buyer intent (all sub-intents mixed).
 */
export function getBestPatternsByIntent(intent: string, limit = 3): IntentPatternStat[] {
  const rows = fetchIntentPatternGroups(intent, null);
  const ranked = rankIntentGroups(rows, Date.now());
  return ranked.slice(0, limit);
}

/**
 * Prefer patterns learned for this intent + sub-intent; if none meet thresholds, fall back to intent-wide `getBestPatternsByIntent`.
 */
export function getBestPatternsForIntentContext(
  intent: string,
  subIntent: SubIntent,
  limit = 3,
): IntentPatternStat[] {
  const now = Date.now();
  const strict = rankIntentGroups(fetchIntentPatternGroups(intent, subIntent), now, {
    strictSubIntentBoost: true,
  });
  if (strict.length > 0) {
    return strict.slice(0, limit);
  }
  return getBestPatternsByIntent(intent, limit);
}
