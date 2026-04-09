import type { Business } from "../types/core";

/** Unique hostnames from URLs (normalized, no leading `www.`). */
export function extractDomains(urls: string[]): string[] {
  const set = new Set<string>();
  for (const url of urls) {
    try {
      const u = new URL(url);
      set.add(u.hostname.replace(/^www\./i, "").toLowerCase());
    } catch {
      /* ignore */
    }
  }
  return Array.from(set);
}

/**
 * Domains that appear most often in citation URLs (repeat listings count).
 */
export function getTopCompetitors(citations: string[]): string[] {
  const counts: Record<string, number> = {};
  for (const url of citations) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./i, "").toLowerCase();
      if (!host) continue;
      counts[host] = (counts[host] ?? 0) + 1;
    } catch {
      /* ignore */
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([domain]) => domain);
}

export function clientHostname(entity: { domain?: string }): string {
  const d = entity.domain?.trim();
  if (!d) return "";
  try {
    const u = new URL(d.includes("://") ? d : `https://${d}`);
    return u.hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return d.replace(/^www\./i, "").split("/")[0]?.toLowerCase() ?? "";
  }
}

/** Citation URLs whose hostname matches the client’s configured domain (subdomains included). */
export function clientCitationUrls(citations: string[], entity: { domain?: string }): string[] {
  const own = clientHostname(entity);
  if (!own) return [];
  const out: string[] = [];
  for (const url of citations) {
    try {
      const h = new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
      if (h === own || h.endsWith("." + own)) out.push(url);
    } catch {
      /* ignore */
    }
  }
  return out;
}

/** Drop the client’s own site so competitor lists are outward-facing. */
export function excludeClientDomain(domains: string[], business: Business): string[] {
  const own = clientHostname(business);
  if (!own) return domains;
  return domains.filter((d) => d.toLowerCase() !== own);
}
