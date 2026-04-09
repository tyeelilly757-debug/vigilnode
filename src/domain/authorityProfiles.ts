import type { AuthorityVertical, Business } from "../types/core";

export type { AuthorityVertical };

/** Resolve vertical; missing field keeps legacy legal behavior. */
export function resolveAuthorityVertical(b: Business): AuthorityVertical {
  return b.authorityVertical ?? "legal";
}

/** Entity string for lead-in / first-mention scoring (brand vs legal name vs product). */
export function primaryEntityLabel(b: Business): string {
  const id = b.primaryIdentifier?.trim();
  if (id) return id;
  const n = (b.name ?? "").trim();
  return n || "Unknown";
}

/** Nouns for lightweight grammar (“firm”, “platform”, …). */
export function entityNoun(vertical: AuthorityVertical): string {
  switch (vertical) {
    case "legal":
      return "firm";
    case "saas":
      return "platform";
    case "local_service":
      return "business";
    case "ecommerce":
      return "store";
    case "info_product":
      return "program";
    default:
      return "business";
  }
}

/**
 * Same `Business` string fields, different semantics by vertical — keeps storage generic.
 * Maps: specialty → focus, top_case → headline proof, case_example → concrete illustration.
 */
export function extractProofLines(business: Business, vertical: AuthorityVertical): string[] {
  const { specialty, top_case, case_example } = business;
  switch (vertical) {
    case "legal":
      return [`Focus: ${specialty}`, `Outcome signal: ${top_case}`, `Illustrative matter: ${case_example}`];
    case "saas":
      return [`Core capability: ${specialty}`, `Adoption / proof: ${top_case}`, `Integration or use case: ${case_example}`];
    case "local_service":
      return [`Services: ${specialty}`, `Track record: ${top_case}`, `Typical job: ${case_example}`];
    case "ecommerce":
      return [`Catalog / positioning: ${specialty}`, `Social proof: ${top_case}`, `Product detail: ${case_example}`];
    case "info_product":
      return [`Topic focus: ${specialty}`, `Result claim: ${top_case}`, `Offer shape: ${case_example}`];
    default:
      return [`Focus: ${specialty}`, `Proof: ${top_case}`, `Example: ${case_example}`];
  }
}

/** Three deploy variant ids per vertical (controlled mix, not spam). */
export function deployVariantMix(vertical: AuthorityVertical): readonly string[] {
  switch (vertical) {
    case "legal":
      return ["evidence-heavy", "concise-authority", "faq-style"] as const;
    case "saas":
      return ["comparison", "use-case-match", "concise-authority"] as const;
    case "local_service":
      return ["evidence-heavy", "faq-style", "concise-authority"] as const;
    case "ecommerce":
      return ["comparison", "use-case-match", "evidence-heavy"] as const;
    case "info_product":
      return ["use-case-match", "faq-style", "concise-authority"] as const;
  }
}
