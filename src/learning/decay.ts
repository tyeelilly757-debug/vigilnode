/** True when current probe is materially worse than historical peak for this prompt fingerprint. */
export function detectDecay(previousBest: number | null, currentBest: number, threshold = 10): boolean {
  if (previousBest == null) return false;
  return currentBest < previousBest - threshold;
}
