/** Words dropped when building SEO slugs from prompts. */
const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "been",
  "being",
  "both",
  "but",
  "by",
  "can",
  "did",
  "do",
  "does",
  "each",
  "few",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "him",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "may",
  "me",
  "more",
  "most",
  "must",
  "my",
  "near",
  "no",
  "nor",
  "not",
  "now",
  "of",
  "on",
  "only",
  "or",
  "our",
  "she",
  "should",
  "so",
  "some",
  "such",
  "than",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "this",
  "those",
  "through",
  "to",
  "too",
  "under",
  "until",
  "very",
  "was",
  "we",
  "were",
  "what",
  "when",
  "where",
  "which",
  "who",
  "whom",
  "why",
  "will",
  "with",
  "you",
  "your",
  "sources",
  "source",
]);

/** Room for prompt stem plus `-v12` / `-reinforce-3` without colliding filenames. */
const SLUG_MAX_LEN = 240;

/** Filename-safe slug (matches GitHub + static AI deploy sanitization). */
export function safeOutcomeFileSlug(slug: string): string {
  const s = slug
    .replace(/[^a-zA-Z0-9-_]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, SLUG_MAX_LEN);
  return s.length > 0 ? s : "page";
}

/**
 * SEO slug from a user prompt, e.g. "best crm software for small business with sources"
 * → "best-crm-software-small-business".
 */
export function keywordSlugFromPrompt(prompt: string): string {
  let s = prompt.toLowerCase();
  s = s.replace(/\bwith sources\b/gi, " ");
  s = s.replace(/[^a-z0-9\s-]/g, " ");
  s = s.replace(/-/g, " ");
  const words = s
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0 && !STOP_WORDS.has(w));
  const hyphenated = words.join("-");
  return safeOutcomeFileSlug(hyphenated || "page");
}

/** Base path segment (no variants) for paired GitHub + site deploys. */
export function outcomeDeploySlug(_jobId: string, prompt: string): string {
  return keywordSlugFromPrompt(prompt);
}
