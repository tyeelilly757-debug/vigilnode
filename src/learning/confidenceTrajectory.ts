/**
 * In-memory blend-confidence snapshots + EMA-smoothed deltas between `/targeted-explore-stats` polls.
 */

const _alphaEnv = Number(process.env.TREND_EMA_ALPHA);
/** EMA weight on the latest raw delta (`0.3`–`0.5` typical). Override: `TREND_EMA_ALPHA`. */
const TREND_EMA_ALPHA =
  Number.isFinite(_alphaEnv) && _alphaEnv > 0 && _alphaEnv < 1 ? _alphaEnv : 0.4;

const MIN_SAMPLES_FOR_TREND = 5;

let lastConfidenceByIntent: Record<string, number> | null = null;
let lastSmoothedDeltaByIntent: Record<string, number> = {};
let lastPollAtMs: number | null = null;

function formatConfidenceTrend(delta: number): string {
  const rounded = Math.round(delta * 100) / 100;
  const s = rounded.toFixed(2);
  return rounded >= 0 ? `+${s}` : s;
}

export type IntentTrendEntry = {
  trend: string | null;
  trendRaw: string | null;
  trendSinceMs: number | null;
  /** UI copy: span for `trend` / `trendRaw` (paired with `trendSinceMs`). */
  trendWindow: string | null;
};

export type ConfidenceTrendMap = Record<string, IntentTrendEntry>;

/**
 * @param samplesByIntent — when `samples < MIN_SAMPLES_FOR_TREND`, trend fields are `null` and EMA is not advanced (avoids noisy “momentum”).
 */
export function takeConfidenceTrends(
  current: Record<string, number>,
  samplesByIntent: Record<string, number>,
): ConfidenceTrendMap {
  const prev = lastConfidenceByIntent;
  const sinceMs = lastPollAtMs;
  const out: ConfidenceTrendMap = {};

  for (const [intent, val] of Object.entries(current)) {
    if (!Number.isFinite(val)) {
      out[intent] = {
        trend: null,
        trendRaw: null,
        trendSinceMs: null,
        trendWindow: null,
      };
      continue;
    }

    const samples = samplesByIntent[intent];
    const n = typeof samples === "number" && Number.isFinite(samples) ? Math.max(0, Math.floor(samples)) : 0;
    const thinData = n < MIN_SAMPLES_FOR_TREND;

    if (thinData || prev === null || !Number.isFinite(prev[intent])) {
      out[intent] = {
        trend: null,
        trendRaw: null,
        trendSinceMs: null,
        trendWindow: null,
      };
      continue;
    }

    const rawDelta = val - prev[intent]!;
    const prevSm = lastSmoothedDeltaByIntent[intent];
    const smoothed =
      Number.isFinite(prevSm) && prevSm !== undefined
        ? TREND_EMA_ALPHA * rawDelta + (1 - TREND_EMA_ALPHA) * prevSm
        : TREND_EMA_ALPHA * rawDelta;

    lastSmoothedDeltaByIntent[intent] = smoothed;

    out[intent] = {
      trend: formatConfidenceTrend(smoothed),
      trendRaw: formatConfidenceTrend(rawDelta),
      trendSinceMs: sinceMs,
      trendWindow: "since last refresh",
    };
  }

  lastConfidenceByIntent = { ...current };
  lastPollAtMs = Date.now();
  return out;
}
