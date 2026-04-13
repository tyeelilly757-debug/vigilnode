/**
 * Quick inspect: latest raw model text + analysis for a target prompt.
 *   npx tsx scripts/peekLatestSnapshot.ts "best barber shop in Houston Texas"
 */
import "dotenv/config";
import { getDb } from "../src/db/sqlite";

const prompt = process.argv.slice(2).join(" ").trim() || "best barber shop in Houston Texas";

const db = getDb();
const row = db
  .prepare(
    `SELECT model, prompt_variant, raw_response, analysis_json, datetime(timestamp/1000, 'unixepoch') AS ts
     FROM outcome_snapshots WHERE prompt = ? ORDER BY timestamp DESC LIMIT 1`,
  )
  .get(prompt) as
  | {
      model: string;
      prompt_variant: string;
      raw_response: string;
      analysis_json: string;
      ts: string;
    }
  | undefined;

if (!row) {
  console.log("No snapshots for prompt:", prompt);
  process.exit(0);
}

console.log("prompt:", prompt);
console.log("ts:", row.ts, "model:", row.model, "variant:", row.prompt_variant);
const raw = row.raw_response ?? "";
console.log("\n--- raw (first 2000 chars) ---\n");
console.log(raw.slice(0, 2000));
const low = raw.toLowerCase();
console.log("\n--- string checks ---");
console.log("includes 'exclusive fadez':", low.includes("exclusive fadez"));
console.log("includes whole word exclusive:", /\bexclusive\b/i.test(raw));
console.log("includes fadez:", /fadez/i.test(raw));
const ex = low.indexOf("exclusive");
if (ex >= 0) console.log("context @exclusive:", raw.slice(Math.max(0, ex - 30), ex + 90));
console.log("\n--- analysis ---\n");
try {
  console.log(JSON.stringify(JSON.parse(row.analysis_json), null, 2));
} catch {
  console.log(row.analysis_json);
}
