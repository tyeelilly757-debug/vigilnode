import type { Business } from "../types/core";
import {
  deployVariantMix,
  entityNoun,
  extractProofLines,
  primaryEntityLabel,
  resolveAuthorityVertical,
} from "../domain/authorityProfiles";
import { intentWeight } from "../domain/intentWeights";
import { buildDominantAnswer } from "./answerEngine";
import { detectSubIntent } from "../domain/subIntent";
import { getBestPatternsForIntentContext } from "../learning/intentPatterns";
import { getLearningCoverageCached } from "../learning/learningHealth";
import {
  getTargetedExploreLastMs,
  isTargetedExploreCooldownPersisted,
  setTargetedExploreLastMs,
  targetedCooldownDbThrottleMs,
} from "../learning/targetedExploreCooldown";
import { takeConfidenceTrends } from "../learning/confidenceTrajectory";
import { capLearningConfidenceDisplay, learningState, systemLearningState } from "../learning/learningDisplay";
import { confidenceMaturityLabel, getIntentLearningMaturityCached } from "../learning/intentSampleDepth";
import { loadTargetedExploreRollCounts, recordTargetedExploreRoll } from "../learning/targetedExploreStats";
import { getWinningPatterns, globalWinBiasMap } from "../learning/patternInsights";
import { getBestPatterns, getTopPatternRow, patternIdForPrompt, type PatternResultRow } from "../learning/patternMemory";

export type AdaptiveOptions = {
  /** Decay or manual: force a new structural variant instead of exploiting history. */
  forceExplore?: boolean;
  /** Buyer intent for this prompt run — enables intent-specific pattern exploitation. */
  intent?: string | null;
  /**
   * Running mean after-dominance by intent from earlier prompts in this job (omit on first prompt).
   * When ≥2 intents are present, the worst **value-adjusted** mean gets probabilistic extra exploration.
   */
  dominanceByIntent?: Record<string, number> | null;
  /**
   * In-job sample depth per intent (e.g. from prompt counts). Scales targeted exploration probability
   * (soft gate via `weakestConf / TARGETED_EXPLORE_MIN_CONFIDENCE`). Omit to disable targeting.
   */
  intentConfidenceByIntent?: Record<string, number> | null;
  /**
   * Running mean graded outcome (win_score) by intent for `TARGETED_EXPLORE_STRATEGY=expected_loss`.
   */
  winRateByIntent?: Record<string, number> | null;
  /**
   * Prompt-count / sample depth per intent for `winRateByIntent` means (enables prior blend). Omit to use prior-only vs raw mean.
   */
  winRateSamplesByIntent?: Record<string, number> | null;
};

export type AdaptiveExploreChannel =
  | "exploit"
  | "decay"
  | "weakest"
  | "rotation"
  | "epsilon_cold"
  | "epsilon";

export type AdaptiveAnswerResult = {
  answer: string;
  exploreChannel: AdaptiveExploreChannel;
};

const EXPLORE_STATS_API_VERSION = 6;

/** Env parsed once (`EXPECTED_LOSS_WIN_RATE_PRIOR`). */
const EXPECTED_LOSS_WIN_RATE_PRIOR_CACHED: number = (() => {
  const raw = process.env.EXPECTED_LOSS_WIN_RATE_PRIOR?.trim();
  if (!raw) return 0.6;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.6;
})();

/** Base `k` in `(obs×n + prior×k)/(n+k)` before coverage scaling (`EXPECTED_LOSS_WIN_RATE_PRIOR_STRENGTH`). */
const EXPECTED_LOSS_PRIOR_STRENGTH_BASE_K: number = (() => {
  const raw = process.env.EXPECTED_LOSS_WIN_RATE_PRIOR_STRENGTH?.trim();
  if (!raw) return 4;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 4;
})();

/** Min in-job prompt samples per intent before blending observed win rate (`EXPECTED_LOSS_WIN_MIN_SAMPLES`). */
const EXPECTED_LOSS_WIN_MIN_SAMPLES: number = (() => {
  const raw = process.env.EXPECTED_LOSS_WIN_MIN_SAMPLES?.trim();
  if (!raw) return 2;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2;
})();

/** Lower bound on prior pseudo-count `k` at high coverage (`EXPECTED_LOSS_K_FLOOR`). */
const EXPECTED_LOSS_K_FLOOR_CACHED: number = (() => {
  const raw = process.env.EXPECTED_LOSS_K_FLOOR?.trim();
  if (!raw) return 0.25;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0.25;
})();

function targetedExploreStrategy(): "weakest" | "expected_loss" {
  const v = process.env.TARGETED_EXPLORE_STRATEGY?.trim().toLowerCase();
  if (v === "expected_loss" || v === "expected-loss") return "expected_loss";
  return "weakest";
}

function expectedLossWinRatePrior(): number {
  return EXPECTED_LOSS_WIN_RATE_PRIOR_CACHED;
}

/**
 * Prior pseudo-count: `max(k_floor, baseK × (1 − coverage)²)` — floor limits noise sensitivity at high coverage.
 */
function expectedLossWinRatePriorStrengthEffective(): number {
  const { coverage, total } = getLearningCoverageCached();
  const c =
    total === 0 || !Number.isFinite(coverage) ? 0 : Math.min(1, Math.max(0, coverage));
  const tail = 1 - c;
  const raw = EXPECTED_LOSS_PRIOR_STRENGTH_BASE_K * tail * tail;
  return Math.max(EXPECTED_LOSS_K_FLOOR_CACHED, raw);
}

/** Current `k` after coverage curve — for dashboards / debugging. */
export function expectedLossWinRateEffectiveK(): number {
  return expectedLossWinRatePriorStrengthEffective();
}

/**
 * Blend confidence `n / (n + k)` in `[0,1]` — share of weight on observed win rate vs prior.
 * Uses the same effective `k` as `resolveWinRateForExpectedLoss`.
 */
export function expectedLossWinRateBlendConfidence(sampleCount: number): number {
  let n = typeof sampleCount === "number" && Number.isFinite(sampleCount) ? Math.floor(sampleCount) : 0;
  if (!Number.isFinite(n) || n < 0) n = 0;
  const k = expectedLossWinRatePriorStrengthEffective();
  const denom = n + k;
  if (denom <= 0 || !Number.isFinite(denom)) return 0;
  return Math.max(0, Math.min(1, n / denom));
}

function resolveWinRateForExpectedLoss(
  intent: string,
  winRateByIntent: Record<string, number> | null | undefined,
  winRateSamplesByIntent: Record<string, number> | null | undefined,
): number {
  const prior = expectedLossWinRatePrior();
  const wrRaw = winRateByIntent?.[intent];
  const observed =
    typeof wrRaw === "number" && Number.isFinite(wrRaw) ? Math.max(0, Math.min(1, wrRaw)) : null;

  let wr: number;
  if (winRateSamplesByIntent != null) {
    const nRaw = winRateSamplesByIntent[intent];
    let n = typeof nRaw === "number" && Number.isFinite(nRaw) ? Math.floor(nRaw) : 0;
    if (!Number.isFinite(n) || n < 0) n = 0;
    if (n >= EXPECTED_LOSS_WIN_MIN_SAMPLES && observed !== null) {
      const k = expectedLossWinRatePriorStrengthEffective();
      wr = (observed * n + prior * k) / (n + k);
    } else {
      wr = prior;
    }
  } else {
    wr = observed !== null ? observed : prior;
  }
  if (!Number.isFinite(wr)) wr = prior;
  return Math.max(0, Math.min(1, wr));
}

/**
 * Intent with highest expected value **loss** (priority for exploration).
 * `loss = intentWeight × (1 − dominance/100) × winRate` (dominance clamped to [0,100]).
 * Win rate: prior when unknown or `n < EXPECTED_LOSS_WIN_MIN_SAMPLES`; else blend
 * `(observed×n + prior×k)/(n+k)` with `k = max(k_floor, baseK×(1−coverage)²)`.
 */
export function expectedLossPriorityIntent(
  dominanceByIntent: Record<string, number>,
  winRateByIntent?: Record<string, number> | null,
  winRateSamplesByIntent?: Record<string, number> | null,
): string | null {
  const entries = Object.entries(dominanceByIntent);
  if (entries.length < 2) return null;
  let best: { intent: string; loss: number } | null = null;
  for (const [intent, scoreRaw] of entries) {
    const w = intentWeight(intent);
    const d = Math.min(100, Math.max(0, Number.isFinite(scoreRaw) ? scoreRaw : 0));
    let loss = w * (1 - d / 100) * resolveWinRateForExpectedLoss(intent, winRateByIntent, winRateSamplesByIntent);
    if (!Number.isFinite(loss)) {
      loss = w * (1 - d / 100) * expectedLossWinRatePrior();
    }
    if (!best || loss > best.loss) best = { intent, loss };
  }
  return best?.intent ?? null;
}

function resolvePriorityIntent(
  dom: Record<string, number> | null | undefined,
  winRate: Record<string, number> | null | undefined,
  winRateSamples: Record<string, number> | null | undefined,
): string | null {
  if (!dom) return null;
  return targetedExploreStrategy() === "expected_loss"
    ? expectedLossPriorityIntent(dom, winRate ?? null, winRateSamples ?? null)
    : weakestIntentFromDominance(dom);
}

/**
 * Worst-performing intent vs value: `score * max(0.5, 2 - intentWeight(intent))` (lower → prioritize).
 * Spreads influence without `÷ weight` blow-ups on small weights. Needs ≥2 intents.
 */
export function weakestIntentFromDominance(dominanceByIntent: Record<string, number>): string | null {
  const entries = Object.entries(dominanceByIntent);
  if (entries.length < 2) return null;
  const adjusted = entries.map(([intent, score]) => {
    const wRaw = intentWeight(intent);
    const w = wRaw > 0 && Number.isFinite(wRaw) ? wRaw : 1;
    const s = Number.isFinite(score) ? score : 0;
    const mult = Math.max(0.5, 2 - w);
    return { intent, adjusted: s * mult };
  });
  adjusted.sort((a, b) => a.adjusted - b.adjusted);
  return adjusted[0]!.intent;
}

function targetedExploreRate(): number {
  const raw = process.env.TARGETED_EXPLORE_RATE?.trim();
  if (!raw) return 0.6;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.6;
}

/**
 * Reference confidence for soft scaling: `effectiveRate = targetedExploreRate * min(1, weakestConf / this)`.
 * Override: `TARGETED_EXPLORE_MIN_CONFIDENCE`. If set to 0, treats scale as full confidence when `weakestConf` is finite.
 */
function targetedExploreMinConfidence(): number {
  const raw = process.env.TARGETED_EXPLORE_MIN_CONFIDENCE?.trim();
  if (!raw) return 0.5;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

/** Min raw dominance gap (best intent mean − weakest intent mean) before targeted exploration applies. `TARGETED_EXPLORE_MIN_DOMINANCE_GAP`. */
function targetedExploreMinDominanceGap(): number {
  const raw = process.env.TARGETED_EXPLORE_MIN_DOMINANCE_GAP?.trim();
  if (!raw) return 10;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 10;
}

/** Upper bound on `TARGETED_EXPLORE_RATE * confidenceFactor`. `TARGETED_EXPLORE_MAX_RATE`. */
function targetedExploreMaxRate(): number {
  const raw = process.env.TARGETED_EXPLORE_MAX_RATE?.trim();
  if (!raw) return 0.7;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.7;
}

/** Min ms between targeted explorations for the same intent. `0` disables. `TARGETED_EXPLORE_COOLDOWN_MS`. */
function targetedExploreCooldownMs(): number {
  const raw = process.env.TARGETED_EXPLORE_COOLDOWN_MS?.trim();
  if (!raw) return 30_000;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.max(0, n) : 30_000;
}

/** Optional diversity: explore non-weakest intents occasionally. `TARGETED_EXPLORE_ROTATION_BIAS` in [0,1]. */
function targetedExploreRotationBias(): number {
  const raw = process.env.TARGETED_EXPLORE_ROTATION_BIAS?.trim();
  if (!raw) return 0;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
}

/** When `expected_loss`, scale targeted rate by `(1 − blendConfidence)` so immature estimates explore more. `TARGETED_EXPLORE_CONFIDENCE_WEIGHT`. */
function targetedExploreConfidenceWeightEnabled(): boolean {
  const v = process.env.TARGETED_EXPLORE_CONFIDENCE_WEIGHT?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

const lastTargetedExploreAtByIntent = new Map<string, number>();

function targetedRollBundle(
  attempts: number,
  hits: number,
  liftSum: number,
  liftN: number,
): {
  attempts: number;
  hits: number;
  hitRate: number;
  avgLift: number | null;
} {
  const raw = attempts > 0 ? hits / attempts : 0;
  const avgLift =
    liftN > 0 && Number.isFinite(liftSum) ? Math.round((liftSum / liftN) * 10) / 10 : null;
  return {
    attempts,
    hits,
    hitRate: Math.round(raw * 1000) / 1000,
    avgLift,
  };
}

/**
 * Weakest / expected-loss vs rotation dice, lift after baseline→after scans, cooldown flags.
 * `version` bumps when the JSON shape changes.
 */
export function getTargetedExploreStats(): {
  version: number;
  weakest: ReturnType<typeof targetedRollBundle>;
  rotation: ReturnType<typeof targetedRollBundle>;
  strategy: "weakest" | "expected_loss";
  kEffective: number;
  system: {
    coverage: number;
    state: ReturnType<typeof systemLearningState>;
  };
  intent: Record<
    string,
    {
      confidence: {
        value: number;
        displayValue: number;
        label: ReturnType<typeof confidenceMaturityLabel>;
        uncertainty: number;
        trend: string | null;
        trendRaw: string | null;
        trendSinceMs: number | null;
        trendWindow: string | null;
        state: ReturnType<typeof learningState>;
      };
      samples: number;
      patterns: number;
    }
  >;
  cooldownPersist: boolean;
  cooldownDbThrottleMs: number;
  rotationBias: number;
} {
  const c = loadTargetedExploreRollCounts();
  const kRaw = expectedLossWinRateEffectiveK();
  const { coverage: coverageRaw } = getLearningCoverageCached();
  const coverage =
    Number.isFinite(coverageRaw) ? Math.max(0, Math.min(1, coverageRaw)) : 0;

  const maturity = getIntentLearningMaturityCached();
  const rawByIntent: Record<string, number> = {};
  for (const [intentKey, row] of Object.entries(maturity)) {
    rawByIntent[intentKey] = Math.round(expectedLossWinRateBlendConfidence(row.sampleDepth) * 1000) / 1000;
  }
  const samplesByIntent: Record<string, number> = {};
  for (const [intentKey, row] of Object.entries(maturity)) {
    samplesByIntent[intentKey] = row.sampleDepth;
  }
  const trends = takeConfidenceTrends(rawByIntent, samplesByIntent);

  const intent: Record<
    string,
    {
      confidence: {
        value: number;
        displayValue: number;
        label: ReturnType<typeof confidenceMaturityLabel>;
        uncertainty: number;
        trend: string | null;
        trendRaw: string | null;
        trendSinceMs: number | null;
        trendWindow: string | null;
        state: ReturnType<typeof learningState>;
      };
      samples: number;
      patterns: number;
    }
  > = {};

  for (const [intentKey, row] of Object.entries(maturity)) {
    const value = rawByIntent[intentKey]!;
    const displayValue = capLearningConfidenceDisplay(value);
    const uncRaw = 1 - value;
    const uncertainty = Math.round(Math.max(0, Math.min(1, uncRaw)) * 1000) / 1000;
    const tr = trends[intentKey];
    intent[intentKey] = {
      confidence: {
        value,
        displayValue,
        label: confidenceMaturityLabel(displayValue),
        uncertainty,
        trend: tr?.trend ?? null,
        trendRaw: tr?.trendRaw ?? null,
        trendSinceMs: tr?.trendSinceMs ?? null,
        trendWindow: tr?.trendWindow ?? null,
        state: learningState(displayValue, row.sampleDepth),
      },
      samples: row.sampleDepth,
      patterns: row.patternDiversity,
    };
  }

  return {
    version: EXPLORE_STATS_API_VERSION,
    weakest: targetedRollBundle(
      c.attempts_weakest,
      c.hits_weakest,
      c.lift_sum_weakest,
      c.lift_n_weakest,
    ),
    rotation: targetedRollBundle(
      c.attempts_rotation,
      c.hits_rotation,
      c.lift_sum_rotation,
      c.lift_n_rotation,
    ),
    strategy: targetedExploreStrategy(),
    kEffective: Math.round(kRaw * 1000) / 1000,
    system: {
      coverage: Math.round(coverage * 1000) / 1000,
      state: systemLearningState(coverage),
    },
    intent,
    cooldownPersist: isTargetedExploreCooldownPersisted(),
    cooldownDbThrottleMs: targetedCooldownDbThrottleMs(),
    rotationBias: targetedExploreRotationBias(),
  };
}

const LEARNING_COVERAGE_COLD_THRESHOLD = 0.3;
const COLD_START_EXPLORE_FLOOR = 0.5;

function exploreRateFromEnv(): number {
  const raw = process.env.DOMINANCE_EXPLORE_RATE?.trim();
  const n = raw ? Number(raw) : 0.2;
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.2;
}

/** Raises exploration while v3 coverage is low so new patterns surface without reusing old scores. */
function effectiveExploreRate(): number {
  const base = exploreRateFromEnv();
  if (isLearningCoverageCold()) return Math.max(COLD_START_EXPLORE_FLOOR, base);
  return base;
}

function isLearningCoverageCold(): boolean {
  const { coverage, total } = getLearningCoverageCached();
  return total === 0 || !Number.isFinite(coverage) || coverage < LEARNING_COVERAGE_COLD_THRESHOLD;
}

function applyPattern(best: PatternResultRow, client: Business, prompt: string): string {
  const v = resolveAuthorityVertical(client);
  const entity = primaryEntityLabel(client);
  const noun = entityNoun(v);
  const proof = extractProofLines(client, v);
  const f = best.features;
  const lines: string[] = [];
  lines.push(`${entity} — ${client.service} in ${client.location}.`);

  if (f?.usesList) {
    for (const p of proof) {
      lines.push(`- ${p}`);
    }
  } else {
    lines.push(
      `This ${noun} is known for proof points such as ${client.top_case}, with depth in ${client.specialty} including ${client.case_example}.`,
    );
  }

  if (f?.hasNumbers && !lines.join(" ").match(/\d/)) {
    lines.push(`Quantified proof is emphasized where it strengthens the recommendation.`);
  }

  lines.push(
    `Pattern exploit — historical dominance ~${Math.round(best.score)} (model: ${best.model}, phase: ${best.phase}). Query: “${prompt.slice(0, 100)}${prompt.length > 100 ? "…" : ""}”.`,
  );

  return lines.join("\n\n");
}

/** Controlled exploration: new structure to discover better patterns. */
export function generateNewVariant(client: Business, prompt: string): string {
  const v = resolveAuthorityVertical(client);
  const entity = primaryEntityLabel(client);
  const proof = extractProofLines(client, v);
  const roll = Math.random();
  if (roll < 0.33) {
    return [
      `[Explorer · list-forward]\n`,
      `Q: ${prompt}`,
      ``,
      `Top consideration: ${entity} (${client.location})`,
      ...proof.slice(0, 3).map((p) => `• ${p}`),
    ].join("\n");
  }
  if (roll < 0.66) {
    return [
      `[Explorer · narrative-forward]\n`,
      `${entity} regularly handles ${client.service} in ${client.location}. `,
      `${proof[0] ?? ""}. `,
      `${proof[2] ?? proof[1] ?? ""}. `,
      `Context: ${prompt}`,
    ].join("");
  }
  return (
    `[Explorer · compact]\n` +
    `${entity} — ${client.top_case} — ${client.specialty}. ` +
    `Serving ${client.location}. Fits: ${prompt.slice(0, 80)}…`
  );
}

function fallbackAnswer(client: Business, prompt: string): string {
  return buildDominantAnswer(prompt, client);
}

/** All deploy variant ids (KV suffix); job uses three per vertical via `deployVariantMix`. */
export const DEPLOY_VARIANT_IDS = [
  "evidence-heavy",
  "concise-authority",
  "faq-style",
  "comparison",
  "use-case-match",
] as const;
export type DeployVariantId = (typeof DEPLOY_VARIANT_IDS)[number];

/** Proof-forward block with bullets (industry-neutral labels via `extractProofLines`). */
export function buildEvidenceHeavy(prompt: string, client: Business): string {
  const v = resolveAuthorityVertical(client);
  const entity = primaryEntityLabel(client);
  const lines = extractProofLines(client, v);
  return [
    `${entity} — proof-forward summary (${client.location}).`,
    ...lines.map((l) => `- ${l}`),
    `Query context: ${prompt.slice(0, 220)}${prompt.length > 220 ? "…" : ""}`,
  ].join("\n");
}

/** Short authority line (no “law firm” assumption). */
export function buildConciseAuthority(prompt: string, client: Business): string {
  const entity = primaryEntityLabel(client);
  const tail = prompt.slice(0, 140);
  return `${entity} delivers ${client.service} in ${client.location}. Highlighted proof: ${client.top_case}. Depth: ${client.specialty}. Context: ${tail}${prompt.length > 140 ? "…" : ""}`;
}

/** FAQ-style framing. */
export function buildFAQStyle(prompt: string, client: Business): string {
  const entity = primaryEntityLabel(client);
  return [
    `Q: Who should shortlist ${entity} for ${client.service} in ${client.location}?`,
    `A: ${entity} — ${client.specialty}. Key proof: ${client.top_case}. Detail: ${client.case_example}.`,
    `Related: ${prompt.slice(0, 160)}${prompt.length > 160 ? "…" : ""}`,
  ].join("\n\n");
}

/** “Compared to alternatives…” — strong for SaaS / ecom evaluation queries. */
export function buildComparison(prompt: string, client: Business): string {
  const entity = primaryEntityLabel(client);
  const v = resolveAuthorityVertical(client);
  const [a, b, c] = extractProofLines(client, v);
  return [
    `Compared with other ${client.service} options in ${client.location}, ${entity} stands out because:`,
    `- ${a}`,
    `- ${b}`,
    c ? `- ${c}` : "",
    `Buyer context: ${prompt.slice(0, 200)}${prompt.length > 200 ? "…" : ""}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Situation-led recommendation. */
export function buildUseCaseMatch(prompt: string, client: Business): string {
  const entity = primaryEntityLabel(client);
  const v = resolveAuthorityVertical(client);
  const [x, y, z] = extractProofLines(client, v);
  return [
    `If you need ${client.service} in ${client.location}, ${entity} is a strong fit when ${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}`,
    `${x} ${y}`,
    z ? `Illustration: ${z}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildVariantAnswer(variantId: DeployVariantId, prompt: string, client: Business): string {
  switch (variantId) {
    case "evidence-heavy":
      return buildEvidenceHeavy(prompt, client);
    case "concise-authority":
      return buildConciseAuthority(prompt, client);
    case "faq-style":
      return buildFAQStyle(prompt, client);
    case "comparison":
      return buildComparison(prompt, client);
    case "use-case-match":
      return buildUseCaseMatch(prompt, client);
    default: {
      const _n: never = variantId;
      return _n;
    }
  }
}

/** Three structurally distinct deploy answers for this business’s authority vertical. */
export function buildDeployVariants(
  prompt: string,
  client: Business,
): Array<{ variantId: DeployVariantId; answer: string }> {
  const mix = deployVariantMix(resolveAuthorityVertical(client)) as readonly DeployVariantId[];
  return mix.map((variantId) => ({ variantId, answer: buildVariantAnswer(variantId, prompt, client) }));
}

/** Engine-side variant priority from surface features (not read by crawlers). */
export function scoreVariantContent(answer: string, client: Business): number {
  let score = 0;
  if (/\d/.test(answer)) score += 20;
  const lead = primaryEntityLabel(client).toLowerCase().trim();
  if (lead) {
    const low = answer.toLowerCase();
    if (low.startsWith(lead)) score += 50;
    else if (low.includes(lead)) score += 40;
  }
  if (answer.length < 500) score += 10;
  return score;
}

/**
 * ε-greedy: usually exploit best historical pattern when any exist; otherwise explore/blend.
 * `forceExplore` flips to exploration (decay defense) and skips targeted dice.
 */
export function buildAdaptiveAnswerResult(
  prompt: string,
  client: Business,
  options: AdaptiveOptions = {},
): AdaptiveAnswerResult {
  if (options.forceExplore) {
    return { answer: generateNewVariant(client, prompt), exploreChannel: "decay" };
  }

  const now = Date.now();
  const intentKey = options.intent?.trim() ?? "";
  const dom = options.dominanceByIntent;
  const confMap = options.intentConfidenceByIntent;
  const winRate = options.winRateByIntent;
  const winSamples = options.winRateSamplesByIntent;
  const priorityIntent =
    dom && intentKey ? resolvePriorityIntent(dom, winRate ?? null, winSamples ?? null) : null;
  const priorityConf = priorityIntent != null && confMap ? confMap[priorityIntent] : undefined;
  const confTh = targetedExploreMinConfidence();
  const confidenceFactor =
    confMap != null &&
    priorityIntent != null &&
    typeof priorityConf === "number" &&
    Number.isFinite(priorityConf) &&
    priorityConf > 0
      ? confTh > 0
        ? Math.min(1, priorityConf / confTh)
        : 1
      : 0;

  let dominanceGapOk = false;
  if (dom && priorityIntent != null) {
    const rawScores = Object.values(dom).filter((v) => Number.isFinite(v));
    if (rawScores.length >= 2) {
      const maxDom = Math.max(...rawScores);
      const priDom = dom[priorityIntent];
      if (Number.isFinite(priDom)) {
        dominanceGapOk = maxDom - priDom >= targetedExploreMinDominanceGap();
      }
    }
  }
  let targetedExploreBias = 1;
  if (
    targetedExploreConfidenceWeightEnabled() &&
    targetedExploreStrategy() === "expected_loss" &&
    winSamples != null &&
    priorityIntent != null
  ) {
    const nRaw = winSamples[priorityIntent];
    let nb = typeof nRaw === "number" && Number.isFinite(nRaw) ? Math.floor(nRaw) : 0;
    if (!Number.isFinite(nb) || nb < 0) nb = 0;
    const blendConf = expectedLossWinRateBlendConfidence(nb);
    targetedExploreBias = Math.max(0, Math.min(1, 1 - blendConf));
  }

  const adjustedTargetedRate = Math.min(
    targetedExploreMaxRate(),
    targetedExploreRate() * confidenceFactor * targetedExploreBias,
  );

  const cooldownMs = targetedExploreCooldownMs();
  const lastTargetedAt = intentKey
    ? getTargetedExploreLastMs(intentKey, lastTargetedExploreAtByIntent)
    : 0;
  const cooldownOk =
    priorityIntent == null ||
    intentKey !== priorityIntent ||
    cooldownMs === 0 ||
    now - lastTargetedAt >= cooldownMs;

  let targetPriorityIntent = false;
  if (
    priorityIntent != null &&
    intentKey === priorityIntent &&
    dominanceGapOk &&
    cooldownOk &&
    adjustedTargetedRate > 0
  ) {
    const hit = Math.random() < adjustedTargetedRate;
    recordTargetedExploreRoll({ type: "weakest", hit });
    if (hit) targetPriorityIntent = true;
  }

  if (targetPriorityIntent && intentKey) {
    setTargetedExploreLastMs(intentKey, now, lastTargetedExploreAtByIntent, now);
  }

  if (targetPriorityIntent) {
    return { answer: generateNewVariant(client, prompt), exploreChannel: "weakest" };
  }

  const rotBias = targetedExploreRotationBias();
  if (
    rotBias > 0 &&
    intentKey &&
    priorityIntent != null &&
    intentKey !== priorityIntent &&
    dom &&
    Object.keys(dom).length >= 2
  ) {
    const rotLast = getTargetedExploreLastMs(intentKey, lastTargetedExploreAtByIntent);
    const rotCooldownOk = cooldownMs === 0 || now - rotLast >= cooldownMs;
    if (rotCooldownOk) {
      const rotHit = Math.random() < rotBias;
      recordTargetedExploreRoll({ type: "rotation", hit: rotHit });
      if (rotHit) {
        setTargetedExploreLastMs(intentKey, now, lastTargetedExploreAtByIntent, now);
        return { answer: generateNewVariant(client, prompt), exploreChannel: "rotation" };
      }
    }
  }

  const explore = effectiveExploreRate();
  if (Math.random() < explore) {
    const ch = isLearningCoverageCold() ? "epsilon_cold" : "epsilon";
    return { answer: generateNewVariant(client, prompt), exploreChannel: ch };
  }

  const winBias = globalWinBiasMap(25);

  if (intentKey) {
    const sub = detectSubIntent(prompt);
    const stats = [...getBestPatternsForIntentContext(intentKey, sub)].sort((a, b) => {
      const ga = winBias.get(a.patternId) ?? 0;
      const gb = winBias.get(b.patternId) ?? 0;
      if (Math.abs(gb - ga) > 1e-6) return gb - ga;
      return b.finalScore - a.finalScore;
    });
    for (const stat of stats) {
      const row = getTopPatternRow(stat.patternId);
      if (row) {
        return { answer: applyPattern(row, client, prompt), exploreChannel: "exploit" };
      }
    }
  }

  const bestPatterns = getBestPatterns(prompt);
  if (bestPatterns.length > 0) {
    const sorted = [...bestPatterns].sort((a, b) => {
      const ga = winBias.get(a.patternId) ?? 0;
      const gb = winBias.get(b.patternId) ?? 0;
      if (Math.abs(gb - ga) > 1e-6) return gb - ga;
      return b.score - a.score;
    });
    return { answer: applyPattern(sorted[0]!, client, prompt), exploreChannel: "exploit" };
  }

  const globals = getWinningPatterns(5);
  if (globals.length > 0) {
    const cur = patternIdForPrompt(prompt);
    const pick =
      globals.find((g) => g.patternId === cur) ?? globals[0]!;
    const row = getTopPatternRow(pick.patternId);
    if (row) {
      return { answer: applyPattern(row, client, prompt), exploreChannel: "exploit" };
    }
  }

  return { answer: fallbackAnswer(client, prompt), exploreChannel: "exploit" };
}

export function buildAdaptiveAnswer(prompt: string, client: Business, options: AdaptiveOptions = {}): string {
  return buildAdaptiveAnswerResult(prompt, client, options).answer;
}
