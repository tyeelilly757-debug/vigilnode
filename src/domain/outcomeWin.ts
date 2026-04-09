import type { ScanResult } from "../types/core";

/**
 * Graded outcome 0–1: how strongly the response favors the primary entity (position + mention).
 * Used for `pattern_results.win_score` / `AVG(win_score)` in intent learning.
 */
export function computeWinScore(scan: ScanResult, primaryName: string): number {
  const e = primaryName.trim().toLowerCase();
  if (!e) return 0;
  const text = (scan.raw ?? "").toLowerCase();

  const fm = scan.firstMention?.trim().toLowerCase();
  if (fm && fm === e) return 1.0;

  const idx = text.indexOf(e);
  if (idx === -1) return 0;

  const firstSentence = text.split(/[.!?](?:\s|$)/)[0] ?? text;
  if (firstSentence.includes(e)) return 0.85;

  if (idx < 40) return 0.8;
  if (idx < 100) return 0.6;
  return 0.4;
}

/** Binary threshold for legacy `win` column and quick filters. */
export function scanOutcomeWin(scan: ScanResult, primaryName: string): boolean {
  return computeWinScore(scan, primaryName) >= 0.5;
}
