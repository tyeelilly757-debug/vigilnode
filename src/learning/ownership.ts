/** Share of recent probes that show lead/strong placement (0–1). Sales-friendly “ownership” metric. */
export function calculateOwnership(
  history: Array<{ mentionLead: boolean; score: number }>,
  scoreWinThreshold = 65,
): number {
  if (history.length === 0) return 0;
  const wins = history.filter((h) => h.mentionLead || h.score >= scoreWinThreshold).length;
  return Math.round((wins / history.length) * 1000) / 1000;
}
