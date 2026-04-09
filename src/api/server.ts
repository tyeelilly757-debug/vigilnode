import "dotenv/config";
import express from "express";
import cors from "cors";
import { getDb } from "../db/sqlite";
import { runAudit } from "../jobs/runAudit";
import { getJobResult } from "../db/repository";
import {
  getLearningCoverage,
  getLearningCoverageCacheStats,
  resetLearningCoverageCacheStats,
} from "../learning/learningHealth";
import { getModelScoreAverages } from "../learning/patternMemory";
import { getTargetedExploreStats } from "../systems/adaptiveAnswerEngine";
import {
  generateOutcomeInsight,
  getOutcomeSummary,
} from "../outcomes/outcomeSummary";
import type { Business } from "../types/core";

getDb();

const app = express();
app.use(
  cors({
    origin: process.env.CORS_ORIGIN?.split(",").map((s) => s.trim()) ?? true,
  }),
);
app.use(express.json({ limit: "256kb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "vigilnode-ai-dominance-engine" });
});

app.post("/api/audit", async (req, res) => {
  try {
    const body = req.body as { business?: Partial<Business> };
    const b = body.business;
    if (
      !b?.name ||
      !b?.service ||
      !b?.location ||
      !b?.specialty ||
      !b?.top_case ||
      !b?.case_example
    ) {
      res.status(400).json({
        error: "business must include name, service, location, specialty, top_case, case_example",
      });
      return;
    }
    const business = b as Business;
    const { jobId } = await runAudit(business);
    res.status(202).json({ jobId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: msg });
  }
});

app.get("/api/jobs/:id", (req, res) => {
  const result = getJobResult(req.params.id);
  if (!result) {
    res.status(404).json({ error: "Job not found" });
    return;
  }
  res.json(result);
});

/** Versioned pattern row coverage (how much v2+ data exists vs legacy). */
app.get("/api/learning/health", (_req, res) => {
  try {
    res.json(getLearningCoverage());
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** Hit/miss counts for `getLearningCoverageCached` (tune TTL, spot DB pressure). */
app.get("/api/learning/cache-stats", (_req, res) => {
  try {
    res.json(getLearningCoverageCacheStats());
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** Targeted exploration rolls (attempts vs hits, persist flag, rotation bias). */
app.get("/api/learning/targeted-explore-stats", (_req, res) => {
  try {
    res.json(getTargetedExploreStats());
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** Reset cache-stat counters only (not the cached coverage snapshot). Requires `x-admin-key`. */
app.post("/api/learning/cache-stats/reset", (req, res) => {
  try {
    const adminKey = (process.env.ADMIN_API_KEY ?? "").toString().trim();
    if (!adminKey) {
      res.status(503).json({ error: "ADMIN_API_KEY is not configured" });
      return;
    }
    const rawHeader = req.headers["x-admin-key"];
    const provided = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader) ?? "";
    if (provided.toString().trim() !== adminKey) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    resetLearningCoverageCacheStats();
    res.json({ ok: true, stats: getLearningCoverageCacheStats() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** Rolling model intelligence (from stored behavior samples). */
app.get("/api/learning/models", (_req, res) => {
  try {
    res.json({ models: getModelScoreAverages() });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

/** Outcome proof: citation trend for an exact audited prompt. */
app.get("/api/outcomes/summary", (req, res) => {
  try {
    const prompt =
      typeof req.query.prompt === "string" ? req.query.prompt.trim() : "";
    if (!prompt) {
      res.status(400).json({ error: "query prompt required" });
      return;
    }
    const summary = getOutcomeSummary(prompt);
    if (!summary) {
      res.status(404).json({ error: "no snapshots for this prompt" });
      return;
    }
    res.json({
      ...summary,
      insight: generateOutcomeInsight(summary),
    });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

const port = Number(process.env.PORT) || 3040;
app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
  console.log(`Redis queue: ${process.env.REDIS_URL ? "BullMQ" : "in-process (set REDIS_URL + npm run worker for scale)"}`);
});
