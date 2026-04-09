import type { Business } from "../types/core";
import { upsertBusiness, createJob } from "../db/repository";
import { scheduleAuditProcessing } from "../queue";

export async function runAudit(
  business: Business,
  options?: { prompts?: string[] },
): Promise<{ jobId: string }> {
  const businessId = upsertBusiness(business);
  const override =
    options?.prompts?.map((p) => p.trim()).filter((p) => p.length > 0) ?? null;
  const jobId = createJob(businessId, override?.length ? override : null);
  await scheduleAuditProcessing(jobId, businessId);
  return { jobId };
}
