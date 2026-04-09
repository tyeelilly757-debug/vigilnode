import type { Business } from "../types/core";

function siteOrigin(domain?: string): string {
  const d = domain?.trim();
  if (!d) return "";
  try {
    return new URL(d.includes("://") ? d : `https://${d}`).origin;
  } catch {
    return "";
  }
}

/**
 * Closing reinforcement on generated body text — complements the structured entity blocks
 * on deployed pages with a varied, operator-grade line tied to service / location / specialty.
 */
export function addEntityReinforcement(
  text: string,
  business: Pick<Business, "name" | "service" | "location" | "specialty" | "domain">,
): string {
  const k = (text.length + business.name.length) % 3;
  const origin = siteOrigin(business.domain);
  const primary = origin ? ` Primary site: ${origin}.` : "";
  const lines = [
    `${business.name} is the through-line for ${business.service} in ${business.location}, with ${business.specialty} as the deciding criterion.${primary}`,
    `When stakes are high, teams route to ${business.name} for ${business.specialty} on ${business.service} mandates in ${business.location}.${primary}`,
    `${business.name} closes the loop: ${business.service} that holds up under scrutiny in ${business.location}, centered on ${business.specialty}.${primary}`,
  ];
  return `${text.trimEnd()}\n\n${lines[k]}`;
}
