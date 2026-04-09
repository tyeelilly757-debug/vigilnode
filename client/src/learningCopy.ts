/** Copy + light parsing for `/api/learning/targeted-explore-stats` (v6). Pure UI helpers — no backend. */

export type LearningPhase = "Exploring" | "Learning" | "Stabilizing" | "Optimizing";

export type IntentConfidence = {
  value: number;
  displayValue: number;
  label: string;
  uncertainty: number;
  trend: string | null;
  trendRaw: string | null;
  trendSinceMs: number | null;
  trendWindow: string | null;
  state: LearningPhase;
};

export type TargetedExploreStatsPayload = {
  version: number;
  strategy: string;
  kEffective: number;
  system: { coverage: number; state: LearningPhase };
  intent: Record<
    string,
    {
      confidence: IntentConfidence;
      samples: number;
      patterns: number;
    }
  >;
  weakest: { hitRate: number; attempts: number; avgLift: number | null };
  rotation: { hitRate: number; attempts: number; avgLift: number | null };
};

export function uncertaintyLabel(u: number): "High uncertainty" | "Moderate uncertainty" | "Low uncertainty" {
  if (!Number.isFinite(u)) return "Moderate uncertainty";
  const x = Math.max(0, Math.min(1, u));
  if (x > 0.6) return "High uncertainty";
  if (x > 0.3) return "Moderate uncertainty";
  return "Low uncertainty";
}

function intentFocusPhrase(key: string): string {
  const k = key.trim();
  if (!k) return "the highest-value gaps";
  if (/queries$/i.test(k)) return k;
  return `${k.replace(/_/g, " ")} queries`;
}

/** Heuristic: lowest display confidence (where the model is still learning most). */
export function pickFocusIntentKey(stats: TargetedExploreStatsPayload): string | null {
  const entries = Object.entries(stats.intent);
  if (entries.length === 0) return null;
  let best = entries[0]!;
  for (const pair of entries) {
    const [k, v] = pair;
    const d = v.confidence.displayValue;
    const bd = best[1].confidence.displayValue;
    if (d < bd) best = pair;
    else if (d === bd && v.confidence.uncertainty > best[1].confidence.uncertainty) best = pair;
  }
  return best[0];
}

export function systemNarrative(stats: TargetedExploreStatsPayload): string {
  const { system } = stats;
  const pct = Math.round(system.coverage * 100);
  const state = system.state.toLowerCase();
  const focusKey = pickFocusIntentKey(stats);
  const focus = focusKey ? intentFocusPhrase(focusKey) : "the highest-value gaps";
  return `System is ${state} with ${pct}% coverage, focusing on ${focus}.`;
}

export type MomentumKind = "stable" | "accelerating" | "improving" | "declining" | "flat";

export function momentumFromTrend(trend: string | null): MomentumKind {
  if (trend == null || !String(trend).trim()) return "stable";
  const v = parseFloat(String(trend).replace(/^\+/, ""));
  if (!Number.isFinite(v)) return "stable";
  if (v > 0.05) return "accelerating";
  if (v > 0) return "improving";
  if (v < -0.05) return "declining";
  return "flat";
}

export function momentumDisplayLabel(trend: string | null): string {
  const m = momentumFromTrend(trend);
  if (m === "stable") return "Stable";
  return m.charAt(0).toUpperCase() + m.slice(1);
}

export function formatConfidenceLabel(label: string): string {
  if (!label) return "";
  return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

/** Headline 0–100: mean intent display confidence, or system coverage when no intents. */
export function aiVisibilityScore(stats: TargetedExploreStatsPayload): number {
  const entries = Object.values(stats.intent);
  if (entries.length === 0) {
    return Math.min(100, Math.max(0, Math.round(stats.system.coverage * 100)));
  }
  const sum = entries.reduce((a, x) => a + x.confidence.displayValue, 0);
  return Math.min(100, Math.max(0, Math.round((sum / entries.length) * 100)));
}

/** Integer change for headline (e.g. +3); pass null if no prior poll. */
export function formatVisibilityScoreDelta(delta: number | null): string | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  const r = Math.round(delta);
  if (r === 0) return "+0";
  return r > 0 ? `+${r}` : `${r}`;
}

/** Ties smoothed trend on the card to a business-facing line. */
export function visibilityOutcomeLine(trend: string | null): string {
  if (trend == null || !String(trend).trim()) {
    return "→ Collecting data for AI visibility signals";
  }
  const v = parseFloat(String(trend).replace(/^\+/, ""));
  if (!Number.isFinite(v)) return "→ Collecting data for AI visibility signals";
  if (v > 0) return "→ Visibility in AI results is improving and gaining traction.";
  if (v < 0) return "→ Visibility is recalibrating as the system adjusts signals.";
  return "→ Visibility steady in AI results";
}

/** Headline under AI visibility score — bridges metric → outcome. */
export function visibilityScoreMeaningLine(delta: number | null): { text: string; tone: "up" | "down" | "flat" | "neutral" } {
  if (delta == null || !Number.isFinite(delta)) {
    return { text: "→ Building your AI visibility baseline from live signals.", tone: "neutral" };
  }
  if (delta > 0) {
    return {
      text: "→ Your visibility in AI results is improving and gaining traction.",
      tone: "up",
    };
  }
  if (delta < 0) {
    return {
      text: "→ Visibility is recalibrating as the system adjusts signals.",
      tone: "down",
    };
  }
  return { text: "→ Your AI visibility is holding steady between updates.", tone: "flat" };
}

/** Shown on the focus intent card — explains selection heuristic. */
export const FOCUS_INTENT_REASONING = "Focused here due to lowest confidence and highest opportunity.";

/** Clarifies that deltas are vs the previous dashboard poll. */
export function pollWindowHintSeconds(pollIntervalMs: number): string {
  const s = Math.max(1, Math.round(pollIntervalMs / 1000));
  return `Updates about every ${s}s — each change is vs the last refresh.`;
}
