import "dotenv/config";
import { runAllClients } from "./runAllClients";

async function main() {
  await runAllClients();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
