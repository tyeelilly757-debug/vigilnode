/**
 * Normalization + fuzzy matching for brand / entity detection in model text.
 * Reduces brittle failures from punctuation, casing, and light typos.
 */

/** Lowercase, strip combining marks, collapse punctuation to spaces. */
export function normalizeForEntityMatch(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[\u2018\u2019\u201c\u201d]/g, "'")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    const ai = a.charCodeAt(i - 1);
    for (let j = 1; j <= n; j++) {
      const cost = ai === b.charCodeAt(j - 1) ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

function maxTypoDistance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return Math.min(2, Math.floor(len / 5));
}

function tokenMatchesAliasWord(hayTokens: string[], word: string): boolean {
  if (word.length < 2) return false;
  const maxD = maxTypoDistance(word.length);
  for (const t of hayTokens) {
    if (t.length < 2) continue;
    if (t.includes(word)) return true;
    // Avoid `word.includes(t)` for short tokens: "men" is inside "exclusive" but is not a brand hit.
    if (word.includes(t) && t.length >= 4) return true;
    if (Math.abs(t.length - word.length) > maxD + 1) continue;
    if (levenshtein(t, word) <= maxD) return true;
  }
  return false;
}

/**
 * True if every significant word in the alias appears in the haystack (order-independent).
 */
function multiWordAliasMatches(hayNorm: string, aliasNorm: string): boolean {
  const words = aliasNorm.split(/\s+/).filter((w) => w.length >= 2);
  if (words.length < 2) return false;
  const hayTokens = hayNorm.split(/\s+/).filter(Boolean);
  return words.every((w) => hayNorm.includes(w) || tokenMatchesAliasWord(hayTokens, w));
}

/**
 * High-confidence entity detection: normalized substring, multi-word coverage, light fuzzy token match.
 */
export function detectEntityMentionRobust(responseText: string, aliases: string[] | undefined | null): boolean {
  if (!aliases?.length) return false;
  const hayNorm = normalizeForEntityMatch(responseText);
  if (!hayNorm) return false;
  const hayTokens = hayNorm.split(/\s+/).filter((t) => t.length >= 2);

  return aliases.some((raw) => {
    const t = raw?.trim();
    if (!t || t.length < 2) return false;
    const aliasNorm = normalizeForEntityMatch(t);
    if (!aliasNorm) return false;

    if (hayNorm.includes(aliasNorm)) return true;

    if (aliasNorm.includes(" ")) {
      if (multiWordAliasMatches(hayNorm, aliasNorm)) return true;
    } else if (aliasNorm.length >= 4 && tokenMatchesAliasWord(hayTokens, aliasNorm)) {
      // Single-token alias only: never pass a multi-word phrase into token matching (substring bugs).
      return true;
    }

    return false;
  });
}
