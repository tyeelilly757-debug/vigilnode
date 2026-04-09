import { randomUUID } from "node:crypto";
import type { AuthorityVertical, Business } from "../types/core";
import { getDb } from "./sqlite";
import { normalizePrimarySiteUrl } from "../utils/primarySiteUrl";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export interface JobSummary {
  dominanceScore: number;
  promptCoverage: number;
  modelsUsed: string[];
  avgBaselineScore: number;
  avgAfterScore: number;
  scansTotal: number;
  /** Cross-model mention agreement on baseline scans (0–1). */
  avgConsensusBaseline: number;
  /** Cross-model mention agreement on second pass (0–1). */
  avgConsensusAfter: number;
  /** Pattern + model-behavior rows written this job. */
  learningWrites: number;
  /** Mean “ownership” (lead / strong score) across prompts (0–1). */
  avgPromptOwnership: number;
  /** How many prompts showed decay vs historical peak. */
  decayEvents: number;
  /** KV / webhook deploy succeeded. */
  edgeDeployed: boolean;
  /** Topic clusters for this audit (prompt lists). */
  promptClusters: Record<string, string[]>;
  /** Mean weighted after-dominance per buyer intent (prompt-run level). */
  dominanceByIntent?: Record<string, number>;
}

const VERTICALS = new Set<AuthorityVertical>([
  "legal",
  "saas",
  "local_service",
  "ecommerce",
  "info_product",
]);

function normalizeVertical(raw: string | null | undefined): AuthorityVertical | undefined {
  if (!raw || typeof raw !== "string") return undefined;
  const v = raw.trim().toLowerCase() as AuthorityVertical;
  return VERTICALS.has(v) ? v : undefined;
}

type BusinessRowExisting = {
  id: string;
  domain: string | null;
  authority_vertical: string | null;
  primary_identifier: string | null;
};

export function upsertBusiness(b: Business): string {
  const db = getDb();
  const existing = db
    .prepare(
      `SELECT id, domain, authority_vertical, primary_identifier FROM businesses WHERE name = ? AND location = ? LIMIT 1`,
    )
    .get(b.name, b.location) as BusinessRowExisting | undefined;
  const id = existing?.id ?? randomUUID();
  const now = new Date().toISOString();

  const domainSql =
    b.domain !== undefined
      ? normalizePrimarySiteUrl(b.domain)
      : (normalizePrimarySiteUrl(existing?.domain ?? undefined) ?? (existing?.domain?.trim() || null));
  const verticalSql =
    b.authorityVertical !== undefined
      ? b.authorityVertical ?? null
      : (existing?.authority_vertical ?? null);
  const primarySql =
    b.primaryIdentifier !== undefined
      ? b.primaryIdentifier?.trim() || null
      : (existing?.primary_identifier ?? null);

  if (existing) {
    db.prepare(
      `UPDATE businesses SET service = ?, specialty = ?, top_case = ?, case_example = ?, domain = ?, authority_vertical = ?, primary_identifier = ? WHERE id = ?`,
    ).run(b.service, b.specialty, b.top_case, b.case_example, domainSql, verticalSql, primarySql, id);
    return id;
  }

  db.prepare(
    `INSERT INTO businesses (id, name, service, location, specialty, top_case, case_example, created_at, domain, authority_vertical, primary_identifier)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    b.name,
    b.service,
    b.location,
    b.specialty,
    b.top_case,
    b.case_example,
    now,
    normalizePrimarySiteUrl(b.domain ?? undefined),
    b.authorityVertical ?? null,
    b.primaryIdentifier?.trim() || null,
  );
  return id;
}

export function loadBusiness(id: string): Business | null {
  const row = getDb()
    .prepare(`SELECT * FROM businesses WHERE id = ?`)
    .get(id) as
    | {
        id: string;
        name: string;
        service: string;
        location: string;
        specialty: string;
        top_case: string;
        case_example: string;
        domain: string | null;
        authority_vertical: string | null;
        primary_identifier: string | null;
      }
    | undefined;
  if (!row) return null;
  return {
    name: row.name,
    service: row.service,
    location: row.location,
    specialty: row.specialty,
    top_case: row.top_case,
    case_example: row.case_example,
    domain: normalizePrimarySiteUrl(row.domain ?? undefined) ?? (row.domain?.trim() || undefined),
    authorityVertical: normalizeVertical(row.authority_vertical),
    primaryIdentifier: row.primary_identifier?.trim() || undefined,
  };
}

export function createJob(businessId: string, overridePrompts?: string[] | null): string {
  const db = getDb();
  const id = randomUUID();
  const now = new Date().toISOString();
  const trimmed =
    overridePrompts?.map((p) => p.trim()).filter((p) => p.length > 0) ?? [];
  const overrideJson = trimmed.length > 0 ? JSON.stringify(trimmed) : null;
  db.prepare(
    `INSERT INTO jobs (id, business_id, status, summary_json, created_at, updated_at, override_prompts_json)
     VALUES (?, ?, 'pending', NULL, ?, ?, ?)`,
  ).run(id, businessId, now, now, overrideJson);
  return id;
}

/** When set, `processAuditJob` runs these prompts only (intent tagged as `best`). */
export function getJobOverridePrompts(jobId: string): string[] | null {
  const row = getDb()
    .prepare(`SELECT override_prompts_json FROM jobs WHERE id = ?`)
    .get(jobId) as { override_prompts_json: string | null } | undefined;
  const raw = row?.override_prompts_json?.trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    const out = parsed
      .filter((x): x is string => typeof x === "string")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

export function updateJobStatus(jobId: string, status: JobStatus, error?: string | null): void {
  const db = getDb();
  db.prepare(`UPDATE jobs SET status = ?, error = ?, updated_at = ? WHERE id = ?`).run(
    status,
    error ?? null,
    new Date().toISOString(),
    jobId,
  );
}

export function saveJobSummary(jobId: string, summary: JobSummary): void {
  getDb()
    .prepare(`UPDATE jobs SET summary_json = ?, status = 'completed', updated_at = ? WHERE id = ?`)
    .run(JSON.stringify(summary), new Date().toISOString(), jobId);
}

export function createPromptRun(
  jobId: string,
  promptText: string,
  sortOrder: number,
  intent: string | null = null,
): string {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO prompt_runs (id, job_id, prompt_text, sort_order, intent) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, jobId, promptText, sortOrder, intent);
  return id;
}

export function insertScan(params: {
  promptRunId: string;
  model: string;
  phase: string;
  raw: string;
  entities: string[];
  firstMention: string;
  score: number;
}): void {
  const id = randomUUID();
  getDb()
    .prepare(
      `INSERT INTO scans (id, prompt_run_id, model, phase, raw_response, entities_json, first_mention, score, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      params.promptRunId,
      params.model,
      params.phase,
      params.raw,
      JSON.stringify(params.entities),
      params.firstMention,
      params.score,
      new Date().toISOString(),
    );
}

export interface JobResultDTO {
  job: {
    id: string;
    businessId: string;
    status: string;
    error: string | null;
    summary: JobSummary | null;
    createdAt: string;
    updatedAt: string;
  };
  business: Business | null;
  prompts: Array<{
    id: string;
    promptText: string;
    intent: string | null;
    scans: Array<{
      id: string;
      model: string;
      phase: string;
      score: number;
      firstMention: string;
      rawExcerpt: string;
    }>;
  }>;
}

export function getJobResult(jobId: string): JobResultDTO | null {
  const db = getDb();
  const job = db.prepare(`SELECT * FROM jobs WHERE id = ?`).get(jobId) as
    | {
        id: string;
        business_id: string;
        status: string;
        error: string | null;
        summary_json: string | null;
        created_at: string;
        updated_at: string;
      }
    | undefined;
  if (!job) return null;

  const business = loadBusiness(job.business_id);
  let summary: JobSummary | null = null;
  if (job.summary_json) {
    try {
      summary = JSON.parse(job.summary_json) as JobSummary;
    } catch {
      summary = null;
    }
  }

  const promptRows = db
    .prepare(`SELECT id, prompt_text, sort_order, intent FROM prompt_runs WHERE job_id = ? ORDER BY sort_order`)
    .all(jobId) as Array<{ id: string; prompt_text: string; sort_order: number; intent: string | null }>;

  const prompts = promptRows.map((pr) => {
    const scanRows = db
      .prepare(
        `SELECT id, model, phase, score, first_mention, raw_response FROM scans WHERE prompt_run_id = ? ORDER BY created_at`,
      )
      .all(pr.id) as Array<{
      id: string;
      model: string;
      phase: string;
      score: number;
      first_mention: string;
      raw_response: string;
    }>;
    return {
      id: pr.id,
      promptText: pr.prompt_text,
      intent: pr.intent,
      scans: scanRows.map((s) => ({
        id: s.id,
        model: s.model,
        phase: s.phase,
        score: s.score,
        firstMention: s.first_mention,
        rawExcerpt: s.raw_response.slice(0, 280),
      })),
    };
  });

  return {
    job: {
      id: job.id,
      businessId: job.business_id,
      status: job.status,
      error: job.error,
      summary,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    },
    business,
    prompts,
  };
}
