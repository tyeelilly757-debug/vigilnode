import type { ScanResult } from "../types/core";

function clientPresent(scan: ScanResult, clientName: string): boolean {
  const n = clientName.trim().toLowerCase();
  if (!n) return false;
  const hay = scan.raw.toLowerCase();
  return hay.includes(n);
}

/** Share of models that mention the client (0–1). Cross-model agreement signal. */
export function calculateConsensus(results: ScanResult[], clientName: string): number {
  if (results.length === 0) return 0;
  const hits = results.filter((r) => clientPresent(r, clientName)).length;
  return hits / results.length;
}
