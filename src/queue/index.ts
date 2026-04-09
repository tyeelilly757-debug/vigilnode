import { Queue } from "bullmq";
import IORedis from "ioredis";
import { processAuditJob } from "../jobs/processAuditJob";

let auditQueue: Queue | null = null;

function redisConnection(): IORedis | null {
  const url = process.env.REDIS_URL?.trim();
  if (!url) return null;
  return new IORedis(url, { maxRetriesPerRequest: null });
}

export function getAuditQueue(): Queue | null {
  if (auditQueue) return auditQueue;
  const conn = redisConnection();
  if (!conn) return null;
  auditQueue = new Queue("audit", { connection: conn });
  return auditQueue;
}

export async function scheduleAuditProcessing(jobId: string, businessId: string): Promise<void> {
  const q = getAuditQueue();
  if (q) {
    await q.add(
      "run",
      { jobId, businessId },
      { jobId, removeOnComplete: { count: 500 }, removeOnFail: { count: 200 } },
    );
    return;
  }

  setImmediate(() => {
    processAuditJob(jobId, businessId).catch((e) => {
      console.error("[audit] job failed", jobId, e);
    });
  });
}
