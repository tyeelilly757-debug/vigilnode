/**
 * Fine-grained cue within a buyer `PromptIntent` (same intent, different phrasing → different structure wins).
 */
export type SubIntent = "vs" | "alternative" | "pricing" | "evaluation" | "reviews" | "near_me" | "generic";

export function detectSubIntent(prompt: string): SubIntent {
  const p = prompt.toLowerCase();
  if (/\bvs\.?\b|\bversus\b/.test(p) || p.includes(" vs ")) return "vs";
  if (p.includes("alternative")) return "alternative";
  if (p.includes("review")) return "reviews";
  if (p.includes("near me") || p.includes("nearby")) return "near_me";
  if (p.includes("pricing") || /\bprice\b/.test(p) || p.includes("cost") || p.includes("subscription"))
    return "pricing";
  if (p.includes("worth it") || p.includes("worth the")) return "evaluation";
  return "generic";
}
