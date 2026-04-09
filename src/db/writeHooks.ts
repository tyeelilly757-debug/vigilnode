import { invalidateLearningCoverageCache } from "../learning/learningHealth";
import { invalidateIntentSampleDepthCache } from "../learning/intentSampleDepth";

let patternWriteBatchDepth = 0;

/**
 * Wrap bulk `pattern_results` writes so the cache invalidates once when the batch ends
 * instead of on every row.
 */
export function beginPatternWriteBatch(): void {
  patternWriteBatchDepth += 1;
}

export function endPatternWriteBatch(): void {
  patternWriteBatchDepth = Math.max(0, patternWriteBatchDepth - 1);
  if (patternWriteBatchDepth === 0) {
    invalidateLearningCoverageCache();
    invalidateIntentSampleDepthCache();
  }
}

/**
 * Single boundary for `pattern_results` mutations affecting learning coverage.
 * Call after INSERT/UPDATE/DELETE (including migrations, backfills, batch loaders).
 */
export function afterPatternResultsWrite(): void {
  if (patternWriteBatchDepth === 0) {
    invalidateLearningCoverageCache();
    invalidateIntentSampleDepthCache();
  }
}
