import "dotenv/config";
import { getDb } from "../db/sqlite";
import { buildProofReport } from "./proofReport";

getDb();

function main() {
  const prompt = process.argv[2]?.trim();

  if (!prompt) {
    console.log('Usage: npm run proof -- "your exact prompt text"');
    process.exit(1);
  }

  const report = buildProofReport(prompt);

  if (!report) {
    console.log("No outcome data for this prompt (run audits that record outcome_snapshots first).");
    process.exit(0);
  }

  console.log("\n📊 AI VISIBILITY REPORT\n");
  console.log(`Prompt: ${report.prompt}`);
  console.log(`Runs: ${report.totalRuns}`);
  console.log(`First citations: ${report.firstCitations}`);
  console.log(`Latest row citations: ${report.latestCitations}`);
  console.log(`Last non-zero citations: ${report.lastNonZeroCitations}`);
  console.log(`Best citations: ${report.bestCitations}`);
  console.log(`Avg citations: ${report.avgCitations.toFixed(2)}`);
  console.log(`Trajectory (signal − first): ${report.trajectoryDelta >= 0 ? "+" : ""}${report.trajectoryDelta}`);
  console.log(`\n📈 Status: ${report.status.toUpperCase()}`);
  console.log(
    `Change vs avg: ${report.changeVsAvg >= 0 ? "+" : ""}${report.changeVsAvg.toFixed(2)}`,
  );
  console.log("");
}

main();
