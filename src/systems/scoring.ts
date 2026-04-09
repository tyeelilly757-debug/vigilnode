import type { ScanResult } from "../types/core";
import { calculateDominance } from "../scoring/dominance";

/**
 * Legacy entry: dominance score with optional cross-model consistency (0–1).
 * Prefer importing `calculateDominance` directly for new code.
 */
export function calculateScore(scan: ScanResult, clientName: string, modelConsensus = 0): number {
  return calculateDominance(scan, clientName, modelConsensus);
}
