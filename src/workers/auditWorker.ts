import "dotenv/config";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { getDb } from "../db/sqlite";
import { processAuditJob } from "../jobs/processAuditJob";

const url = process.env.REDIS_URL?.trim();
if (!url) {
  console.error("REDIS_URL is required for npm run worker");
  process.exit(1);
}

getDb();

const connection = new IORedis(url, { maxRetriesPerRequest: null });

new Worker<{ jobId: string; businessId: string }>(
  "audit",
  async (job) => {
    const { jobId, businessId } = job.data;
    await processAuditJob(jobId, businessId);
  },
  { connection },
);

console.log("Audit worker listening on queue: audit");
