/** Structured bundle pushed to Cloudflare Worker → KV → AI-bot HTML injection. */
export interface DominancePayload {
  clientId: string;
  domain: string;
  prompt: string;
  /** Learning / analytics (pattern memory id). */
  patternId: string;
  /** Structural variant id — KV suffix `client:{id}:prompt:{hash}:{variantId}`. */
  variantId: string;
  /** Deploy-side priority; Worker sorts and injects top variants by this. */
  weight: number;
  dominanceScore: number;
  answer: string;
  schema: Record<string, unknown>;
  evidence: unknown[];
  timestamp: number;
}
