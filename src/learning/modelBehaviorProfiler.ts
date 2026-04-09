import type { ModelFeatures } from "./types";

/** Structured behavioral features of a model response (for compounding model intelligence). */
export function extractModelFeatures(response: string): ModelFeatures {
  const trimmed = response.trim();
  return {
    hasNumbers: /\d/.test(trimmed),
    usesList: /^[\s]*[-*•]|\n[-*•]/m.test(trimmed) || /\n\d+\.\s/.test(trimmed),
    firstEntityPosition: trimmed.indexOf("\n"),
    length: trimmed.length,
    lineBreaks: (trimmed.match(/\n/g) ?? []).length,
    wordCount: trimmed.split(/\s+/).filter(Boolean).length,
  };
}
