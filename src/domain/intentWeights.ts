import type { PromptIntent } from "./promptProfiles";

/**
 * Revenue / decision-value weights for intents (relative multipliers on base dominance 0–100).
 * High-value commercial intents (pricing, hire, case help) score higher when weighted.
 */
export const INTENT_WEIGHTS: Record<PromptIntent, number> = {
  best: 1.0,
  comparison: 1.2,
  alternative: 1.1,
  use_case: 1.0,
  pricing: 1.3,
  legitimacy: 1.2,
  who_to_hire: 1.4,
  case_help: 1.3,
  near_me: 1.2,
  who_to_call: 1.3,
  reviews: 1.2,
  is_it_worth_it: 1.3,
  results: 1.1,
};

export function intentWeight(intent: string): number {
  const w = INTENT_WEIGHTS[intent as PromptIntent];
  return typeof w === "number" ? w : 1;
}
