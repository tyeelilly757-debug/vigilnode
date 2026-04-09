import "dotenv/config";
import { clients } from "../automation/clients";
import { getDb } from "../db/sqlite";
import { buildClientProof } from "./clientProof";

getDb();

function main() {
  for (const client of clients) {
    const report = buildClientProof(client.name, client.prompts);

    if (!report) {
      console.log(`\n(No outcome data yet for ${client.name})`);
      continue;
    }

    console.log("\n==============================");
    console.log(`📊 CLIENT: ${report.clientName}`);
    console.log("==============================\n");

    console.log(`Prompts tracked: ${report.prompts}`);
    console.log(`Improving: ${report.improving}`);
    console.log(`Declining: ${report.declining}`);
    console.log(`Stable: ${report.stable}`);

    console.log(
      `\n📈 Avg change: ${report.avgChange >= 0 ? "+" : ""}${report.avgChange}`,
    );

    console.log(
      `🚀 Total trajectory: ${report.totalTrajectory >= 0 ? "+" : ""}${report.totalTrajectory}`,
    );
  }
}

main();
