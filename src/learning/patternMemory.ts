import { createHash, randomUUID } from "node:crypto";
import { getDb } from "../db/sqlite";
import { afterPatternResultsWrite } from "../db/writeHooks";
import type { ModelFeatures } from "./types";
import { PATTERN_SCORING_VERSION } from "./scoringVersion";

export type PatternResultRow = {
  patternId: string;
  prompt: string;
  score: number;
  model: string;
  phase: string;
  features: ModelFeatures | null;
  createdAt: string;
};

export function patternIdForPrompt(prompt: string): string {
  return createHash("sha256").update(prompt.trim().toLowerCase()).digest("hex").slice(0, 24);
}

export function savePatternResult(params: {
  patternId: string;
  prompt: string;
  score: number;
  model: string;
  phase: string;
  jobId?: string;
  businessId?: string;
  features: ModelFeatures;
  mentionLead?: boolean;
  intent?: string | null;
  subIntent?: string | null;
  /** Outcome quality 0–1 (`computeWinScore`). */
  winScore: number;
}): void {
  const db = getDb();
  const id = randomUUID();
  const lead = params.mentionLead ? 1 : 0;
  const ws = Math.max(0, Math.min(1, Number(params.winScore) || 0));
  const win = ws >= 0.5 ? 1 : 0;
  db.prepare(
    `INSERT INTO pattern_results (id, pattern_id, prompt_text, score, model, phase, job_id, business_id, features_json, mention_lead, intent, sub_intent, scoring_version, win, win_score, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    params.patternId,
    params.prompt,
    params.score,
    params.model,
    params.phase,
    params.jobId ?? null,
    params.businessId ?? null,
    JSON.stringify(params.features),
    lead,
    params.intent ?? null,
    params.subIntent ?? null,
    PATTERN_SCORING_VERSION,
    win,
    ws,
    new Date().toISOString(),
  );
  afterPatternResultsWrite();
}

/** Best score for this prompt fingerprint from prior jobs (excludes current run). */
export function getHistoricalMaxScore(patternId: string, excludeJobId: string): number | null {
  const row = getDb()
    .prepare(
      `SELECT MAX(score) AS m FROM pattern_results WHERE pattern_id = ? AND scoring_version = ? AND (job_id IS NULL OR job_id != ?)`,
    )
    .get(patternId, PATTERN_SCORING_VERSION, excludeJobId) as { m: number | null } | undefined;
  if (row?.m == null) return null;
  return row.m;
}

export function getRecentPatternHistory(patternId: string, limit = 40): Array<{ mentionLead: boolean; score: number }> {
  const rows = getDb()
    .prepare(
      `SELECT mention_lead, score FROM pattern_results WHERE pattern_id = ? AND scoring_version = ? ORDER BY created_at DESC LIMIT ?`,
    )
    .all(patternId, PATTERN_SCORING_VERSION, limit) as Array<{ mention_lead: number; score: number }>;
  return rows.map((r) => ({ mentionLead: r.mention_lead === 1, score: r.score }));
}

/** Top historical rows for this prompt fingerprint (highest scores first). */
export function getBestPatterns(prompt: string, limit = 8): PatternResultRow[] {
  const patternId = patternIdForPrompt(prompt);
  const rows = getDb()
    .prepare(
      `SELECT pattern_id, prompt_text, score, model, phase, features_json, created_at
       FROM pattern_results WHERE pattern_id = ? AND scoring_version = ? ORDER BY score DESC, created_at DESC LIMIT ?`,
    )
    .all(patternId, PATTERN_SCORING_VERSION, limit) as Array<{
    pattern_id: string;
    prompt_text: string;
    score: number;
    model: string;
    phase: string;
    features_json: string | null;
    created_at: string;
  }>;

  return rows.map((r) => toPatternResultRow(r));
}

/** Best single row for a fingerprint (e.g. to reuse features from intent winners). */
export function getTopPatternRow(patternId: string): PatternResultRow | null {
  const row = getDb()
    .prepare(
      `SELECT pattern_id, prompt_text, score, model, phase, features_json, created_at
       FROM pattern_results WHERE pattern_id = ? AND scoring_version = ?
       ORDER BY score DESC, created_at DESC LIMIT 1`,
    )
    .get(patternId, PATTERN_SCORING_VERSION) as
    | {
        pattern_id: string;
        prompt_text: string;
        score: number;
        model: string;
        phase: string;
        features_json: string | null;
        created_at: string;
      }
    | undefined;
  if (!row) return null;
  return toPatternResultRow(row);
}

function toPatternResultRow(r: {
  pattern_id: string;
  prompt_text: string;
  score: number;
  model: string;
  phase: string;
  features_json: string | null;
  created_at: string;
}): PatternResultRow {
  return {
    patternId: r.pattern_id,
    prompt: r.prompt_text,
    score: r.score,
    model: r.model,
    phase: r.phase,
    features: safeFeatures(r.features_json),
    createdAt: r.created_at,
  };
}

function safeFeatures(raw: string | null): ModelFeatures | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ModelFeatures;
  } catch {
    return null;
  }
}

export function saveModelBehaviorSample(model: string, features: ModelFeatures, score: number): void {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO model_behavior_samples (id, model, feature_vector_json, score, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, model, JSON.stringify(features), score, new Date().toISOString());
}

/** Rolling average score per model from stored samples (cheap moat dashboard). */
export function getModelScoreAverages(): Array<{ model: string; avgScore: number; samples: number }> {
  const rows = getDb()
    .prepare(
      `SELECT model, AVG(score) AS avg_score, COUNT(*) AS c FROM model_behavior_samples GROUP BY model ORDER BY avg_score DESC`,
    )
    .all() as Array<{ model: string; avg_score: number; c: number }>;
  return rows.map((r) => ({ model: r.model, avgScore: Math.round(r.avg_score * 10) / 10, samples: r.c }));
}
