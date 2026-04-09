/**
 * CLI smoke test (no DB). For production path: `npm run api` + dashboard, or POST /api/audit.
 */
import "dotenv/config";
import { runLoop } from "./systems/loop";
import type { Business } from "./types/core";

const business: Business = {
  name: "VigilNode Legal Group",
  service: "trucking accident lawyer",
  location: "Sacramento",
  specialty: "catastrophic injury and trucking litigation",
  top_case: "$4.2M settlement",
  case_example: "multi-vehicle highway collisions",
};

runLoop(business).catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
