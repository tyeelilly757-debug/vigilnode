import type { AuthorityVertical, Business } from "../types/core";
import { primaryEntityLabel, resolveAuthorityVertical } from "./authorityProfiles";

/** Buyer-style intents used for prompt generation (not model-facing labels). */
export type PromptIntent =
  | "best"
  | "comparison"
  | "alternative"
  | "use_case"
  | "pricing"
  | "legitimacy"
  | "who_to_hire"
  | "case_help"
  | "near_me"
  | "who_to_call"
  | "reviews"
  | "is_it_worth_it"
  | "results";

export interface PromptSpec {
  prompt: string;
  intent: PromptIntent;
}

export const PROMPT_INTENTS_BY_VERTICAL: Record<AuthorityVertical, PromptIntent[]> = {
  legal: ["best", "who_to_hire", "case_help"],
  saas: ["best", "comparison", "alternative", "pricing", "use_case"],
  ecommerce: ["best", "comparison", "reviews"],
  local_service: ["best", "near_me", "who_to_call"],
  info_product: ["best", "is_it_worth_it", "results"],
};

function buildIntentPrompts(
  intent: PromptIntent,
  business: Business,
  vertical: AuthorityVertical,
): string[] {
  const b = business;
  const entity = primaryEntityLabel(b);
  const loc = b.location.trim();
  const svc = b.service.trim();

  switch (intent) {
    case "best":
      return [`best ${svc} ${loc}`, `top ${svc} ${loc}`];

    case "comparison": {
      if (vertical === "saas" || vertical === "ecommerce") {
        return [`${entity} vs competitors`, `best alternatives to ${entity} for ${svc}`];
      }
      return [`${entity} compared to other ${svc} ${loc}`, `how does ${entity} compare for ${svc} in ${loc}`];
    }

    case "alternative":
      return [`best alternative to ${entity}`, `${entity} vs other ${svc} options`];

    case "pricing":
      return [`${entity} pricing`, `is ${entity} worth it for ${svc}`];

    case "use_case":
      return [`best ${svc} for my use case`, `what should I use for ${svc} in ${loc}`];

    case "legitimacy":
      return [`is ${entity} legit`, `${entity} reviews ${loc}`];

    case "who_to_hire":
      return vertical === "legal"
        ? [`who is the best ${svc} attorney ${loc}`, `who should I hire for ${svc} in ${loc}`]
        : [`who should I work with for ${svc} in ${loc}`, `best ${svc} provider ${loc}`];

    case "case_help":
      return [`${svc} case help ${loc}`, `need help with ${b.specialty} ${loc}`];

    case "near_me":
      return [`${svc} near me ${loc}`, `local ${svc} ${loc}`];

    case "who_to_call":
      return [`who to call for ${svc} in ${loc}`, `best ${svc} in ${loc}`];

    case "reviews":
      return [`${entity} reviews`, `is ${entity} good for ${svc}`];

    case "is_it_worth_it":
      return [`is ${entity} worth it`, `should I buy ${entity} for ${svc}`];

    case "results":
      return [`${entity} results`, `what to expect from ${entity} ${svc}`];

    default: {
      const _x: never = intent;
      return [_x];
    }
  }
}

function dedupePromptSpecs(specs: PromptSpec[]): PromptSpec[] {
  const seen = new Set<string>();
  const out: PromptSpec[] = [];
  for (const s of specs) {
    const k = s.prompt.trim().toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

/** Full prompt deck for an audit: vertical intent mix × 2-ish phrasings each, deduped. */
export function generatePromptSpecs(business: Business): PromptSpec[] {
  const vertical = resolveAuthorityVertical(business);
  const intents = PROMPT_INTENTS_BY_VERTICAL[vertical];
  const specs: PromptSpec[] = [];
  for (const intent of intents) {
    for (const prompt of buildIntentPrompts(intent, business, vertical)) {
      const p = prompt.trim();
      if (p) specs.push({ prompt: p, intent });
    }
  }
  return dedupePromptSpecs(specs);
}
