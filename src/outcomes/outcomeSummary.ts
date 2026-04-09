import { getDb } from "../db/sqlite";

export type OutcomeSummary = {
  prompt: string;
  totalSnapshots: number;
  avgCitations: number;
  latestCitations: number;
  /** Nearest snapshot with citation count > 0 scanning backward (ignores trailing zero-only rows). */
  lastNonZeroCitations: number;
  firstCitations: number;
  /** Peak citation count in any snapshot (sales / proof). */
  bestCitations: number;
  /** Raw: last snapshot minus first (can be misleading if the final rows are 0). */
  improvement: number;
};

type CitationsRow = { citations: string | null };

function citationCount(json: string | null): number {
  try {
    const a = JSON.parse(json ?? "[]");
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string").length : 0;
  } catch {
    return 0;
  }
}

/**
 * All `outcome_snapshots` for a prompt, chronological — trajectory of extracted URL counts.
 */
export function getOutcomeSummary(prompt: string): OutcomeSummary | null {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT citations FROM outcome_snapshots
       WHERE prompt = ?
       ORDER BY timestamp ASC`,
    )
    .all(prompt) as CitationsRow[];

  if (rows.length === 0) return null;

  const counts = rows.map((r) => citationCount(r.citations));
  const totalSnapshots = counts.length;
  const firstCitations = counts[0]!;
  const latestCitations = counts[totalSnapshots - 1]!;
  let lastNonZeroCitations = latestCitations;
  for (let i = totalSnapshots - 1; i >= 0; i--) {
    if (counts[i]! > 0) {
      lastNonZeroCitations = counts[i]!;
      break;
    }
  }
  const avgCitations = counts.reduce((a, b) => a + b, 0) / totalSnapshots;
  const bestCitations = Math.max(...counts);

  return {
    prompt,
    totalSnapshots,
    avgCitations,
    latestCitations,
    lastNonZeroCitations,
    firstCitations,
    bestCitations,
    improvement: latestCitations - firstCitations,
  };
}

/** One-line narrative for demos / logs / future APIs. */
export function generateOutcomeInsight(summary: OutcomeSummary): string {
  const signalDelta = summary.lastNonZeroCitations - summary.firstCitations;
  if (signalDelta > 0) {
    return "Visibility increasing. Reinforcement working.";
  }
  if (signalDelta === 0) {
    return "Stable visibility. Further optimization needed.";
  }
  return "Visibility declining. Regeneration required.";
}
