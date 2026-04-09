import { generateOutcomeInsight, getOutcomeSummary } from "./outcomeSummary";

const prompt = process.argv[2]?.trim();

if (!prompt) {
  console.log('Usage: npm run report -- "your exact prompt text"');
  process.exit(1);
}

const summary = getOutcomeSummary(prompt);

if (!summary) {
  console.log("No outcome data for this prompt (run audits that hit this exact prompt string first).");
  process.exit(0);
}

console.log("\n📊 AI Visibility Report\n");
console.log("Prompt:", summary.prompt);
console.log("Snapshots:", summary.totalSnapshots);
console.log("First citations:", summary.firstCitations);
console.log("Latest row citations:", summary.latestCitations);
console.log("Last non-zero citations:", summary.lastNonZeroCitations);
console.log("Average citations:", summary.avgCitations.toFixed(2));
console.log(
  "\n📈 Raw tail delta (latest row − first):",
  summary.improvement > 0 ? `+${summary.improvement}` : String(summary.improvement),
);
console.log("\n💡 Insight:", generateOutcomeInsight(summary));
console.log("");
