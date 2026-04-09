import type { LearningPhase, MomentumKind } from "./learningCopy";

export const TOOLTIP_CONFIDENCE = "Higher confidence = more reliable AI positioning.";
export const TOOLTIP_UNCERTAINTY = "Uncertainty decreases as the system learns more signals.";

export function confidenceLabelColor(label: string): string {
  const l = label.toLowerCase();
  if (l === "low") return "#f87171";
  if (l === "medium") return "#fbbf24";
  if (l === "high") return "#34d399";
  return "rgba(232,232,234,0.75)";
}

/** Trend delta display: positive green, negative red, flat neutral. */
export function trendDeltaColor(delta: number): string {
  if (delta > 0) return "#4ade80";
  if (delta < 0) return "#f87171";
  return "rgba(232,232,234,0.45)";
}

export function momentumKindColor(kind: MomentumKind): string {
  switch (kind) {
    case "accelerating":
      return "#4ade80";
    case "improving":
      return "#34d399";
    case "flat":
      return "#9ca3af";
    case "declining":
      return "#f87171";
    case "stable":
    default:
      return "#9ca3af";
  }
}

export function phaseStateColor(state: LearningPhase): string {
  switch (state) {
    case "Exploring":
      return "#9ca3af";
    case "Learning":
      return "#60a5fa";
    case "Stabilizing":
      return "#c084fc";
    case "Optimizing":
      return "#34d399";
    default:
      return "#e8e8ea";
  }
}
