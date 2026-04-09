/** Cap shown confidence so the product never reads as “100% sure” (`displayValue` only; `value` stays exact). */
export const LEARNING_CONFIDENCE_DISPLAY_CAP = 0.9;

export function capLearningConfidenceDisplay(raw: number): number {
  if (!Number.isFinite(raw)) return 0;
  const v = Math.max(0, Math.min(1, raw));
  return Math.min(LEARNING_CONFIDENCE_DISPLAY_CAP, Math.round(v * 1000) / 1000);
}

/**
 * Single headline state for dashboard copy: depth + (display-capped) confidence.
 * Uses `displayConfidence` thresholds so labels match what the buyer sees.
 */
export function learningState(
  displayConfidence: number,
  sampleDepth: number,
): "Exploring" | "Learning" | "Stabilizing" | "Optimizing" {
  const n = Number.isFinite(sampleDepth) ? Math.max(0, Math.floor(sampleDepth)) : 0;
  const c = Number.isFinite(displayConfidence) ? displayConfidence : 0;
  if (n < 5) return "Exploring";
  if (c < 0.5) return "Learning";
  if (c < 0.8) return "Stabilizing";
  return "Optimizing";
}

/** Headline system phase from global v3 coverage share (distinct from per-intent `learningState`). */
export function systemLearningState(coverage: number): "Exploring" | "Learning" | "Stabilizing" | "Optimizing" {
  const c = Number.isFinite(coverage) ? Math.max(0, Math.min(1, coverage)) : 0;
  if (c < 0.3) return "Exploring";
  if (c < 0.6) return "Learning";
  if (c < 0.85) return "Stabilizing";
  return "Optimizing";
}
