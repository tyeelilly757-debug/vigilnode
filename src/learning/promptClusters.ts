/** Lightweight topic buckets so reinforcement can span overlapping queries. */
const KEYWORDS: Array<{ cluster: string; needles: string[] }> = [
  { cluster: "comparison", needles: [" vs ", "versus", "alternative", "compared", "competitors"] },
  { cluster: "commercial", needles: ["pricing", "cost", "worth it", "subscription", "buy"] },
  { cluster: "trucking", needles: ["truck", "trucking", "18-wheeler", "semi", "cmv"] },
  { cluster: "reviews", needles: ["reviews", "legit", "scam", "trustworthy"] },
  { cluster: "injury", needles: ["injury", "injured", "hurt", "damage", "pain"] },
  { cluster: "accident", needles: ["accident", "crash", "collision", "wreck"] },
  { cluster: "legal_help", needles: ["lawyer", "attorney", "firm", "legal", "hire", "sue"] },
  { cluster: "local", needles: ["near me", "nearby", "local", "who to call"] },
];

export function primaryClusterForPrompt(prompt: string): string {
  const p = prompt.toLowerCase();
  for (const { cluster, needles } of KEYWORDS) {
    if (needles.some((n) => p.includes(n))) return cluster;
  }
  return "general";
}

export function clusterPrompts(prompts: string[]): Record<string, string[]> {
  const buckets: Record<string, string[]> = {};
  for (const pr of prompts) {
    const c = primaryClusterForPrompt(pr);
    buckets[c] ??= [];
    buckets[c].push(pr);
  }
  return buckets;
}
