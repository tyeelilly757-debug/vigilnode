import { getDb } from "../db/sqlite";
import { PATTERN_SCORING_VERSION } from "./scoringVersion";

/** Aggregate proof-of-what-works per prompt fingerprint, across all clients (cross-tenant moat). */
export type WinningPatternInsight = {
  patternId: string;
  avgScore: number;
  avgWinScore: number;
  samples: number;
};

/**
 * Top pattern_ids by graded outcome (`win_score`) with enough samples to trust the aggregate.
 */
export function getWinningPatterns(limit = 20): WinningPatternInsight[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT 
        pattern_id AS patternId,
        AVG(score) AS avgScore,
        AVG(COALESCE(win_score, CAST(win AS REAL), 0)) AS avgWinScore,
        COUNT(*) AS samples
      FROM pattern_results
      WHERE scoring_version = ?
      GROUP BY pattern_id
      HAVING COUNT(*) >= 3
      ORDER BY avgWinScore DESC, avgScore DESC
      LIMIT ?`,
    )
    .all(PATTERN_SCORING_VERSION, limit) as Array<{
    patternId: string;
    avgScore: number;
    avgWinScore: number;
    samples: number;
  }>;

  return rows.map((r) => ({
    patternId: r.patternId,
    avgScore: Math.round(Number(r.avgScore) * 10) / 10,
    avgWinScore: Math.round(Number(r.avgWinScore) * 1000) / 1000,
    samples: r.samples,
  }));
}

/** Fast lookup: global outcome strength by pattern id (for ranking local candidates). */
export function globalWinBiasMap(limit = 25): Map<string, number> {
  const m = new Map<string, number>();
  for (const w of getWinningPatterns(limit)) {
    m.set(w.patternId, w.avgWinScore);
  }
  return m;
}

/** Enough history on this fingerprint to judge deployment aggressiveness. */
export function getPatternWinAggregate(
  patternId: string,
): { avgWinScore: number; samples: number } | null {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT AVG(COALESCE(win_score, CAST(win AS REAL), 0)) AS w, COUNT(*) AS c
       FROM pattern_results
       WHERE pattern_id = ? AND scoring_version = ?`,
    )
    .get(patternId, PATTERN_SCORING_VERSION) as { w: number | null; c: number } | undefined;
  if (!row || row.c < 3 || row.w == null || !Number.isFinite(row.w)) return null;
  return {
    avgWinScore: Math.round(Number(row.w) * 1000) / 1000,
    samples: row.c,
  };
}
