import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

let dbInstance: Database.Database | null = null;

function defaultDbFileRelativeToCwd(): string {
  const cwd = process.cwd();
  const monorepoRunAll = path.join(cwd, "..", "src", "automation", "runAll.ts");
  if (fs.existsSync(monorepoRunAll)) {
    return path.join("..", "data", "dominance.db");
  }
  return path.join("data", "dominance.db");
}

export function getDb(): Database.Database {
  if (dbInstance) return dbInstance;
  const raw =
    process.env.DATABASE_PATH?.trim() || defaultDbFileRelativeToCwd();
  const file = path.isAbsolute(raw) ? raw : path.join(process.cwd(), raw);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  dbInstance = new Database(file);
  dbInstance.pragma("journal_mode = WAL");
  migrate(dbInstance);
  return dbInstance;
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS businesses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      service TEXT NOT NULL,
      location TEXT NOT NULL,
      specialty TEXT NOT NULL,
      top_case TEXT NOT NULL,
      case_example TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      business_id TEXT NOT NULL,
      status TEXT NOT NULL,
      error TEXT,
      summary_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (business_id) REFERENCES businesses(id)
    );
    CREATE INDEX IF NOT EXISTS idx_jobs_business ON jobs(business_id);
    CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);

    CREATE TABLE IF NOT EXISTS prompt_runs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (job_id) REFERENCES jobs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_prompt_runs_job ON prompt_runs(job_id);

    CREATE TABLE IF NOT EXISTS scans (
      id TEXT PRIMARY KEY,
      prompt_run_id TEXT NOT NULL,
      model TEXT NOT NULL,
      phase TEXT NOT NULL,
      raw_response TEXT,
      entities_json TEXT,
      first_mention TEXT,
      score REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (prompt_run_id) REFERENCES prompt_runs(id)
    );
    CREATE INDEX IF NOT EXISTS idx_scans_prompt ON scans(prompt_run_id);

    CREATE TABLE IF NOT EXISTS pattern_results (
      id TEXT PRIMARY KEY,
      pattern_id TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      score REAL NOT NULL,
      model TEXT NOT NULL,
      phase TEXT NOT NULL,
      job_id TEXT,
      business_id TEXT,
      features_json TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_pr_pattern_score ON pattern_results(pattern_id, score DESC);
    CREATE INDEX IF NOT EXISTS idx_pr_business ON pattern_results(business_id);

    CREATE TABLE IF NOT EXISTS model_behavior_samples (
      id TEXT PRIMARY KEY,
      model TEXT NOT NULL,
      feature_vector_json TEXT NOT NULL,
      score REAL NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_mbs_model ON model_behavior_samples(model, created_at DESC);

    CREATE TABLE IF NOT EXISTS targeted_explore_cooldown (
      intent TEXT PRIMARY KEY,
      last_ms INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS targeted_explore_stats_singleton (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      attempts INTEGER NOT NULL DEFAULT 0,
      hits INTEGER NOT NULL DEFAULT 0
    );
    INSERT OR IGNORE INTO targeted_explore_stats_singleton (id, attempts, hits) VALUES (1, 0, 0);

    CREATE TABLE IF NOT EXISTS outcome_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prompt TEXT NOT NULL,
      model TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      citations TEXT,
      raw_response TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_outcome_snapshots_timestamp ON outcome_snapshots(timestamp);
    CREATE INDEX IF NOT EXISTS idx_outcome_snapshots_model ON outcome_snapshots(model);
  `);

  addColumnIfMissing(db, "businesses", "domain", "ALTER TABLE businesses ADD COLUMN domain TEXT");
  addColumnIfMissing(
    db,
    "businesses",
    "authority_vertical",
    "ALTER TABLE businesses ADD COLUMN authority_vertical TEXT",
  );
  addColumnIfMissing(
    db,
    "businesses",
    "primary_identifier",
    "ALTER TABLE businesses ADD COLUMN primary_identifier TEXT",
  );
  addColumnIfMissing(
    db,
    "jobs",
    "override_prompts_json",
    "ALTER TABLE jobs ADD COLUMN override_prompts_json TEXT",
  );
  addColumnIfMissing(db, "prompt_runs", "intent", "ALTER TABLE prompt_runs ADD COLUMN intent TEXT");
  addColumnIfMissing(db, "pattern_results", "intent", "ALTER TABLE pattern_results ADD COLUMN intent TEXT");
  addColumnIfMissing(
    db,
    "pattern_results",
    "mention_lead",
    "ALTER TABLE pattern_results ADD COLUMN mention_lead INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "pattern_results",
    "scoring_version",
    "ALTER TABLE pattern_results ADD COLUMN scoring_version INTEGER NOT NULL DEFAULT 1",
  );
  addColumnIfMissing(db, "pattern_results", "sub_intent", "ALTER TABLE pattern_results ADD COLUMN sub_intent TEXT");
  addColumnIfMissing(
    db,
    "pattern_results",
    "win",
    "ALTER TABLE pattern_results ADD COLUMN win INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "pattern_results",
    "win_score",
    "ALTER TABLE pattern_results ADD COLUMN win_score REAL NOT NULL DEFAULT 0",
  );
  backfillWinScoreFromLegacyWin(db);
  migrateTargetedExploreStatsSingleton(db);
}

/** Add weakest vs rotation columns and backfill legacy `attempts` / `hits` into weakest once. */
function migrateTargetedExploreStatsSingleton(db: Database.Database): void {
  const t = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'targeted_explore_stats_singleton'`)
    .get() as { name: string } | undefined;
  if (!t) return;
  addColumnIfMissing(
    db,
    "targeted_explore_stats_singleton",
    "attempts_weakest",
    "ALTER TABLE targeted_explore_stats_singleton ADD COLUMN attempts_weakest INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "targeted_explore_stats_singleton",
    "hits_weakest",
    "ALTER TABLE targeted_explore_stats_singleton ADD COLUMN hits_weakest INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "targeted_explore_stats_singleton",
    "attempts_rotation",
    "ALTER TABLE targeted_explore_stats_singleton ADD COLUMN attempts_rotation INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "targeted_explore_stats_singleton",
    "hits_rotation",
    "ALTER TABLE targeted_explore_stats_singleton ADD COLUMN hits_rotation INTEGER NOT NULL DEFAULT 0",
  );
  db.prepare(`
    UPDATE targeted_explore_stats_singleton
    SET attempts_weakest = attempts, hits_weakest = hits
    WHERE id = 1
      AND attempts_weakest = 0 AND hits_weakest = 0
      AND (attempts > 0 OR hits > 0)
  `).run();
  addColumnIfMissing(
    db,
    "targeted_explore_stats_singleton",
    "lift_sum_weakest",
    "ALTER TABLE targeted_explore_stats_singleton ADD COLUMN lift_sum_weakest REAL NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "targeted_explore_stats_singleton",
    "lift_n_weakest",
    "ALTER TABLE targeted_explore_stats_singleton ADD COLUMN lift_n_weakest INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "targeted_explore_stats_singleton",
    "lift_sum_rotation",
    "ALTER TABLE targeted_explore_stats_singleton ADD COLUMN lift_sum_rotation REAL NOT NULL DEFAULT 0",
  );
  addColumnIfMissing(
    db,
    "targeted_explore_stats_singleton",
    "lift_n_rotation",
    "ALTER TABLE targeted_explore_stats_singleton ADD COLUMN lift_n_rotation INTEGER NOT NULL DEFAULT 0",
  );
}

/** Legacy rows had only `win`; approximate win_score = 1 where win = 1. */
function backfillWinScoreFromLegacyWin(db: Database.Database): void {
  db.prepare(`UPDATE pattern_results SET win_score = 1.0 WHERE win = 1 AND win_score = 0`).run();
}

function addColumnIfMissing(db: Database.Database, table: string, column: string, ddl: string): void {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    db.exec(ddl);
  }
}
