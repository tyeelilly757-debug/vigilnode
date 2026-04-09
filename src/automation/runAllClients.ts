import { getDb } from "../db/sqlite";
import { clients } from "./clients";
import { runClient } from "./runClient";

export async function runAllClients(): Promise<void> {
  getDb();
  for (const client of clients) {
    await runClient(client);
  }
}
