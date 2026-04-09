import { getDb } from "../db/sqlite";

export type OutcomeSnapshot = {
  prompt: string;
  model: string;
  timestamp: number;
  citations: string[];
  rawResponse?: string;
};

/** Persist one model output slice for longitudinal outcome / citation analysis (`better-sqlite3` = sync). */
export function recordOutcome(snapshot: OutcomeSnapshot): void {
  try {
    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO outcome_snapshots
      (prompt, model, timestamp, citations, raw_response)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      snapshot.prompt,
      snapshot.model,
      snapshot.timestamp,
      JSON.stringify(snapshot.citations ?? []),
      snapshot.rawResponse ?? null,
    );
  } catch (e) {
    console.error("[outcome_snapshots] insert failed:", e);
  }
}
