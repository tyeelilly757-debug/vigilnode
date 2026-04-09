import "dotenv/config";
import { clients } from "../automation/clients";
import { getDb } from "../db/sqlite";
import { sendClientReport } from "./sendClientReport";

getDb();

async function main() {
  for (const client of clients) {
    const email = client.email?.trim();
    if (!email) continue;

    await sendClientReport(client.name, client.prompts, email);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
