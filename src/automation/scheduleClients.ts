import "dotenv/config";
import cron from "node-cron";
import { getDb } from "../db/sqlite";
import { sendClientReport } from "../outcomes/sendClientReport";
import { clients } from "./clients";
import { runAllClients } from "./runAllClients";

getDb();

const schedule = process.env.CLIENT_CRON_SCHEDULE?.trim() || "0 * * * *";

if (!cron.validate(schedule)) {
  console.error(`Invalid CLIENT_CRON_SCHEDULE: ${schedule}`);
  process.exit(1);
}

cron.schedule(schedule, async () => {
  console.log("⏱ Running scheduled client jobs...", new Date().toISOString());
  try {
    await runAllClients();
    for (const c of clients) {
      const to = c.email?.trim();
      if (!to) continue;
      try {
        await sendClientReport(c.name, c.prompts, to);
      } catch (err) {
        console.error(`[schedule] send report failed for ${c.name}`, err);
      }
    }
  } catch (e) {
    console.error("[schedule] runAllClients failed", e);
  }
});

console.log(`Scheduled client runs: ${schedule} (set CLIENT_CRON_SCHEDULE to change)`);
console.log("Process stays alive; use Ctrl+C to stop.");
