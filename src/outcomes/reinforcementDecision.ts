import { isStrongWin, type OutcomeComparison } from "./outcomeComparison";

export function shouldReinforce(comp: OutcomeComparison | null): boolean {
  if (!comp) return false;
  return isStrongWin(comp);
}
