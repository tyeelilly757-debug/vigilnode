import type { OutcomeComparison } from "./outcomeComparison";

export type OutcomeDecision = {
  shouldRegenerate: boolean;
  reason: string;
  severity: "low" | "medium" | "high";
};

export function decideOutcomeAction(comp: OutcomeComparison | null): OutcomeDecision {
  if (!comp) {
    return {
      shouldRegenerate: false,
      reason: "Not enough data yet",
      severity: "low",
    };
  }

  const { newCitations, lostCitations, citationDelta } = comp;

  if (citationDelta < 0 || lostCitations.length > newCitations.length) {
    return {
      shouldRegenerate: true,
      reason: "Losing citations",
      severity: "high",
    };
  }

  if (citationDelta === 0) {
    return {
      shouldRegenerate: true,
      reason: "No improvement",
      severity: "medium",
    };
  }

  return {
    shouldRegenerate: false,
    reason: "Improving",
    severity: "low",
  };
}

/** Merge severities so one prompt uses the strictest trigger across models. */
export function mergeRegenerationSeverity(
  current: "medium" | "high" | null,
  next: OutcomeDecision,
): "medium" | "high" | null {
  if (!next.shouldRegenerate) return current;
  if (next.severity === "high") return "high";
  if (current === "high") return "high";
  if (next.severity === "medium") return "medium";
  return current;
}
