/**
 * Stored on `pattern_results.scoring_version`. Bump when dominance / weighting
 * semantics change so learning queries ignore incompatible historical scores.
 *
 * 1 = legacy (unweighted base dominance)
 * 2 = intent-weighted dominance (capped); binary / naive `win` signal
 * 3 = same dominance stack as v2 + graded `win_score` and intent `winRate` formula (`0.4 + 1.2×winRate`)
 */
export const PATTERN_SCORING_VERSION = 3;
