/** Industry / posture for proof + variant selection (defaults to legal for backward compatibility). */
export type AuthorityVertical =
  | "legal"
  | "saas"
  | "local_service"
  | "ecommerce"
  | "info_product";

export interface Business {
  name: string;
  service: string;
  location: string;
  specialty: string;
  top_case: string;
  case_example: string;
  /**
   * Primary site: full URL (`https://example.com`) or hostname. Drives LocalBusiness.url (origin),
   * `/ai/` canonical URLs with SITE_PUBLIC_BASE, and client-domain citation detection.
   */
  domain?: string;
  /** Drives proof labels and deploy variant mix; omit = `legal`. */
  authorityVertical?: AuthorityVertical;
  /** Lead-entity string for scoring (brand, product, app); omit = `name`. */
  primaryIdentifier?: string;
}

export interface ScanResult {
  prompt: string;
  entities: string[];
  firstMention: string;
  evidence: string[];
  raw: string;
  /** Provider-structured URLs (e.g. Perplexity `citations` / `search_results`), not necessarily in `raw`. */
  apiCitations?: string[];
}
