import type { Business } from "../types/core";
import { generatePromptSpecs, type PromptIntent, type PromptSpec } from "../domain/promptProfiles";

export type { PromptIntent, PromptSpec };

/** Prompt deck with intent tags (for clustering, scoring, and job storage). */
export function generatePrompts(business: Business): PromptSpec[] {
  return generatePromptSpecs(business);
}

/** Plain string list when only text is needed. */
export function promptStringsFromSpecs(specs: PromptSpec[]): string[] {
  return specs.map((s) => s.prompt);
}
