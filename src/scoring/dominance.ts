import type { ScanResult } from "../types/core";
import { isLeadSentenceMention, isStrictOpeningMention } from "../learning/firstMention";

/**
 * Single interpretable dominance number (0–100): opening/lead mention, presence,
 * numeric “evidence” density, cross-model consistency.
 */
export function calculateDominance(
  scan: ScanResult,
  clientName: string,
  modelConsistency: number,
): number {
  const strictOpen = isStrictOpeningMention(clientName, scan.raw);
  const lead = isLeadSentenceMention(clientName, scan.raw);
  const firstBlock = strictOpen ? 0.4 : lead ? 0.28 : 0;

  const entityPresence = scan.raw.toLowerCase().includes(clientName.trim().toLowerCase()) ? 0.3 : 0;

  const citationCount = Math.min(scan.evidence.length * 0.02, 0.2);
  const modelC = Math.max(0, Math.min(1, modelConsistency)) * 0.1;

  const raw = firstBlock + entityPresence + citationCount + modelC;
  return Math.round(Math.min(1, raw) * 100);
}

/**
 * Applies intent value multiplier, capped at 100 (for aggregates / deploy thresholds).
 */
export function calculateWeightedDominance(
  scan: Parameters<typeof calculateDominance>[0],
  clientName: string,
  modelConsistency: number,
  intentMultiplier: number,
): number {
  const base = calculateDominance(scan, clientName, modelConsistency);
  return Math.round(Math.min(100, base * intentMultiplier));
}
