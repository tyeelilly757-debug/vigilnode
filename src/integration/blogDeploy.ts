import fs from "node:fs";
import path from "node:path";
import { normalizeEnvPublicBase } from "../utils/primarySiteUrl";
import { safeOutcomeFileSlug } from "./deploySlug";

/** URL path segment under the site origin (Vite `public/` mirror). */
export const AI_PUBLIC_PATH_SEGMENT = "ai";

/**
 * Directory for static `/ai/*.html` source files (`vite` copies `public/` → `dist/`).
 * Supports cwd = monorepo root or `client/` (e.g. Vercel “Root Directory” = `client`).
 */
export function resolveAiHtmlPublicDir(): string {
  const cwd = process.cwd();
  const monorepoClientPkg = path.join(cwd, "client", "package.json");
  if (fs.existsSync(monorepoClientPkg)) {
    return path.join(cwd, "client", "public", AI_PUBLIC_PATH_SEGMENT);
  }
  return path.join(cwd, "public", AI_PUBLIC_PATH_SEGMENT);
}

function sitePublicBase(): string {
  const raw =
    process.env.SITE_PUBLIC_BASE?.trim() ||
    process.env.BLOG_PUBLIC_BASE?.trim() ||
    "http://localhost:5174";
  return normalizeEnvPublicBase(raw);
}

/** Public URL for a raw slug (cross-linking before write). */
export function blogPublicUrlForSlug(rawSlug: string): string {
  const safe = safeOutcomeFileSlug(rawSlug);
  const base = sitePublicBase();
  return `${base}/${AI_PUBLIC_PATH_SEGMENT}/${safe}.html`;
}

/**
 * Writes a full HTML document to `client/public/ai/{slug}.html` for Vite static serving.
 * After `npm run build` in client/, files are served at `/{AI_PUBLIC_PATH_SEGMENT}/{slug}.html`.
 */
export function deployBlogHtml(fullHtml: string, slug: string): string {
  const safe = safeOutcomeFileSlug(slug);
  const dir = resolveAiHtmlPublicDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${safe}.html`);
  fs.writeFileSync(file, fullHtml, "utf8");
  const base = sitePublicBase();
  return `${base}/${AI_PUBLIC_PATH_SEGMENT}/${safe}.html`;
}
