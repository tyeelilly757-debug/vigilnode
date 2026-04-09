import type { Business } from "../types/core";
import { generatePrompts } from "./promptEngine";
import { scanPrompt } from "./truthScanner";
import { buildDominantAnswer } from "./answerEngine";
import { generateVariants } from "./consensusEngine";
import { calculateScore } from "./scoring";
import { analyzeResponse } from "./modelProfiler";

/**
 * For each prompt: baseline scan → build dominant answer + variants → re-scan same user prompt
 * (MVP: does not submit variants to a model; “after” reflects market answer stability for that prompt).
 * Extend with shadow-page / injector feed for true before/after.
 */
export async function runLoop(business: Business): Promise<void> {
  const specs = generatePrompts(business);

  for (const { prompt } of specs) {
    console.log("\n--- PROMPT:", prompt);

    const before = await scanPrompt(prompt);
    console.log("Before (snippet):", before.raw.slice(0, 200).replace(/\s+/g, " ") + "…");
    console.log("Baseline score:", calculateScore(before, business.name));

    const answer = buildDominantAnswer(prompt, business);
    const variants = generateVariants(answer);

    console.log("\nGenerated variants (preview):");
    variants.forEach((v) => console.log("-", v.slice(0, 80) + (v.length > 80 ? "…" : "")));

    const profile = analyzeResponse(answer);
    console.log("Dominant-answer profile:", profile);

    const after = await scanPrompt(prompt);
    console.log("After (snippet):", after.raw.slice(0, 200).replace(/\s+/g, " ") + "…");

    const score = calculateScore(after, business.name);
    console.log("\nScore (after pass):", score);
  }
}
