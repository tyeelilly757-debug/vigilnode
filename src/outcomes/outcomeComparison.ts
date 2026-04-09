import { getDb } from "../db/sqlite";

export type OutcomeComparison = {
  prompt: string;
  model: string;
  beforeCitations: string[];
  afterCitations: string[];
  newCitations: string[];
  lostCitations: string[];
  citationDelta: number;
};

type SnapshotRow = {
  citations: string | null;
  raw_response: string | null;
};

function parseCitationArray(json: string | null): string[] {
  try {
    const a = JSON.parse(json ?? "[]");
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/**
 * Compare the two most recent `outcome_snapshots` for this prompt + model
 * (typically “after” vs “before” within the same audit step).
 */
export function compareLatestOutcomes(prompt: string, model: string): OutcomeComparison | null {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT citations, raw_response FROM outcome_snapshots
       WHERE prompt = ? AND model = ?
       ORDER BY timestamp DESC
       LIMIT 2`,
    )
    .all(prompt, model) as SnapshotRow[];

  if (rows.length < 2) return null;

  const [latest, previous] = rows;
  const after = parseCitationArray(latest.citations);
  const before = parseCitationArray(previous.citations);

  const newCitations = after.filter((c) => !before.includes(c));
  const lostCitations = before.filter((c) => !after.includes(c));

  return {
    prompt,
    model,
    beforeCitations: before,
    afterCitations: after,
    newCitations,
    lostCitations,
    citationDelta: after.length - before.length,
  };
}

/** Simple win heuristic: more new citations than lost. */
export function didOutcomeImprove(comp: OutcomeComparison): boolean {
  return comp.newCitations.length > comp.lostCitations.length;
}

/** Citation surge with no losses — candidate for amplification deploys. */
export function isStrongWin(comp: OutcomeComparison): boolean {
  return (
    comp.newCitations.length >= 2 &&
    comp.lostCitations.length === 0 &&
    comp.citationDelta > 0
  );
}
