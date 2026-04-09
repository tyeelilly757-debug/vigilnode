import { getOutcomeSummary } from "./outcomeSummary";

export type ProofReportStatus = "improving" | "declining" | "stable";

export type ProofReport = {
  prompt: string;
  /** Number of outcome snapshots (= proof points over time). */
  totalRuns: number;
  avgCitations: number;
  bestCitations: number;
  latestCitations: number;
  /** Last meaningful citation count (trailing zeros ignored). */
  lastNonZeroCitations: number;
  firstCitations: number;
  /** Signal minus mean — not skewed by a zero final snapshot. */
  changeVsAvg: number;
  /** Signal minus first snapshot — “overall trajectory”. */
  trajectoryDelta: number;
  status: ProofReportStatus;
};

/**
 * Client-facing proof object: ties citation trajectory to a simple status line.
 */
export function buildProofReport(prompt: string): ProofReport | null {
  const summary = getOutcomeSummary(prompt);
  if (!summary) return null;

  const signal = summary.lastNonZeroCitations;
  const changeVsAvg = signal - summary.avgCitations;
  const eps = 1e-9;
  let status: ProofReportStatus;
  if (changeVsAvg > eps) status = "improving";
  else if (changeVsAvg < -eps) status = "declining";
  else status = "stable";

  return {
    prompt: summary.prompt,
    totalRuns: summary.totalSnapshots,
    avgCitations: summary.avgCitations,
    bestCitations: summary.bestCitations,
    latestCitations: summary.latestCitations,
    lastNonZeroCitations: signal,
    firstCitations: summary.firstCitations,
    changeVsAvg,
    trajectoryDelta: signal - summary.firstCitations,
    status,
  };
}
