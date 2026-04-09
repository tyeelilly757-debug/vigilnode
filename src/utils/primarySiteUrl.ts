/** True for local Vite / dev servers — do not force https or strip www. */
function isLoopbackHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}

/**
 * Canonical URL stored on `Business.domain` and used in schema: `https` origin, no `www`, no path.
 * Accepts `https://hiveclick.net`, `http://www.hiveclick.net/foo`, or bare `hiveclick.net`.
 */
export function normalizePrimarySiteUrl(raw: string | null | undefined): string | null {
  const t = raw?.trim();
  if (!t) return null;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (isLoopbackHost(u.hostname)) {
      return u.origin;
    }
    u.protocol = "https:";
    if (/^www\./i.test(u.hostname)) {
      u.hostname = u.hostname.replace(/^www\./i, "");
    }
    return u.origin;
  } catch {
    return null;
  }
}

/**
 * Same rules as `normalizePrimarySiteUrl` for `SITE_PUBLIC_BASE` / `BLOG_PUBLIC_BASE` env values.
 */
export function normalizeEnvPublicBase(raw: string): string {
  const t = raw.trim().replace(/\/$/, "");
  if (!t) return t;
  try {
    const u = new URL(t.includes("://") ? t : `https://${t}`);
    if (isLoopbackHost(u.hostname)) {
      return u.origin.replace(/\/$/, "");
    }
    u.protocol = "https:";
    if (/^www\./i.test(u.hostname)) {
      u.hostname = u.hostname.replace(/^www\./i, "");
    }
    return u.origin.replace(/\/$/, "");
  } catch {
    return t.replace(/\/$/, "");
  }
}
