/**
 * Manual check: run after 2+ snapshots exist for the same prompt+model.
 *
 *   npx tsx src/outcomes/testComparison.ts "your prompt text" perplexity
 */
import { compareLatestOutcomes, didOutcomeImprove } from "./outcomeComparison";

const prompt = process.argv[2] ?? process.env.TEST_OUTCOME_PROMPT ?? "";
const model = process.argv[3] ?? "perplexity";

if (!prompt.trim()) {
  console.error("Usage: npx tsx src/outcomes/testComparison.ts \"<prompt>\" [model]");
  console.error("Example: npx tsx src/outcomes/testComparison.ts \"best lawyer in Austin\" openai");
  process.exit(1);
}

const result = compareLatestOutcomes(prompt.trim(), model.trim());
console.log(JSON.stringify(result, null, 2));
if (result) {
  console.log("didOutcomeImprove:", didOutcomeImprove(result));
} else {
  console.log("(need at least 2 outcome_snapshots for this prompt + model — run an audit first)");
}
