function stripTrailingJunk(url: string): string {
  return url.replace(/[)\],.;]+$/g, "");
}

/**
 * Pull http(s) URLs from model output (plain links, markdown, angle brackets).
 * Refine further once raw responses show other patterns.
 */
export function extractCitations(text: string): string[] {
  if (!text) return [];
  const set = new Set<string>();

  const plain = text.matchAll(/https?:\/\/[^\s\])"'<>]+/g);
  for (const m of plain) {
    set.add(stripTrailingJunk(m[0]));
  }

  const md = text.matchAll(/\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g);
  for (const m of md) {
    set.add(stripTrailingJunk(m[1]!));
  }

  const angle = text.matchAll(/<(https?:\/\/[^>\s]+)>/g);
  for (const m of angle) {
    set.add(stripTrailingJunk(m[1]!));
  }

  return Array.from(set);
}
