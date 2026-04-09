-- Run in Supabase SQL editor when you move off SQLite.
-- Adjust UUID defaults to gen_random_uuid() if desired.

CREATE TABLE IF NOT EXISTS businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  service TEXT NOT NULL,
  location TEXT NOT NULL,
  specialty TEXT NOT NULL,
  top_case TEXT NOT NULL,
  case_example TEXT NOT NULL,
  domain TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  error TEXT,
  summary_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_jobs_business ON jobs(business_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, created_at DESC);

CREATE TABLE IF NOT EXISTS prompt_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  prompt_text TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_prompt_runs_job ON prompt_runs(job_id);

CREATE TABLE IF NOT EXISTS scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_run_id UUID NOT NULL REFERENCES prompt_runs(id) ON DELETE CASCADE,
  model TEXT NOT NULL,
  phase TEXT NOT NULL,
  raw_response TEXT,
  entities_json JSONB,
  first_mention TEXT,
  score REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scans_prompt ON scans(prompt_run_id);
CREATE INDEX IF NOT EXISTS idx_scans_model_phase ON scans(model, phase);

CREATE TABLE IF NOT EXISTS pattern_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id TEXT NOT NULL,
  prompt_text TEXT NOT NULL,
  score REAL NOT NULL,
  model TEXT NOT NULL,
  phase TEXT NOT NULL,
  job_id UUID,
  business_id UUID,
  features_json JSONB,
  mention_lead BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pr_pattern_score ON pattern_results(pattern_id, score DESC);

CREATE TABLE IF NOT EXISTS model_behavior_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model TEXT NOT NULL,
  feature_vector_json JSONB NOT NULL,
  score REAL NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mbs_model ON model_behavior_samples(model, created_at DESC);
