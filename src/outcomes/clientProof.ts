import { buildProofReport, type ProofReport } from "./proofReport";

export type ClientProofAggregate = {
  clientName: string;
  /** Prompts that had at least one outcome snapshot. */
  prompts: number;
  improving: number;
  declining: number;
  stable: number;
  avgChange: number;
  totalTrajectory: number;
  /** Per-prompt rows (reuse for email/Slack later). */
  details: ProofReport[];
};

/** Roll up `buildProofReport` across every query you track for this client. */
export function buildClientProof(
  clientName: string,
  prompts: string[],
): ClientProofAggregate | null {
  const reports: ProofReport[] = [];
  for (const p of prompts) {
    const t = p.trim();
    if (!t) continue;
    const r = buildProofReport(t);
    if (r) reports.push(r);
  }

  if (reports.length === 0) return null;

  const improving = reports.filter((r) => r.status === "improving").length;
  const declining = reports.filter((r) => r.status === "declining").length;
  const stable = reports.filter((r) => r.status === "stable").length;

  const avgChange =
    reports.reduce((sum, r) => sum + r.changeVsAvg, 0) / reports.length;

  const totalTrajectory = reports.reduce((sum, r) => sum + r.trajectoryDelta, 0);

  return {
    clientName,
    prompts: reports.length,
    improving,
    declining,
    stable,
    avgChange: Math.round(avgChange * 10) / 10,
    totalTrajectory,
    details: reports,
  };
}
