/**
 * Emit sitemap.xml + robots.txt under client/public/ so Bing/Google can discover /ai/*.html.
 *
 *   SITE_PUBLIC_BASE=https://exclusivefadez.vercel.app npx tsx scripts/generateSitemapAndRobots.ts
 *   npx tsx scripts/generateSitemapAndRobots.ts --use-publish-manifest
 *
 * --use-publish-manifest: only URLs listed in client/public/.last-ai-publish-slugs.txt
 * (default: every client/public/ai/*.html).
 */
import fs from "node:fs";
import path from "node:path";

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolvePublicRoot(): string {
  const cwd = process.cwd();
  const monorepo = path.join(cwd, "client", "package.json");
  if (fs.existsSync(monorepo)) return path.join(cwd, "client", "public");
  return path.join(cwd, "public");
}

function getPublicBase(): string {
  let base =
    process.env.SITE_PUBLIC_BASE?.trim() ||
    process.env.BLOG_PUBLIC_BASE?.trim() ||
    "https://exclusivefadez.vercel.app";
  if (!/^https?:\/\//i.test(base)) base = `https://${base}`;
  return base.replace(/\/$/, "");
}

function listAiHtmlFiles(aiDir: string, onlySlugs: Set<string> | null): string[] {
  if (!fs.existsSync(aiDir)) return [];
  const files = fs.readdirSync(aiDir).filter((f) => f.endsWith(".html"));
  if (!onlySlugs) return files.sort();
  const out: string[] = [];
  for (const f of files) {
    const slug = f.replace(/\.html$/i, "");
    if (onlySlugs.has(slug)) out.push(f);
  }
  return out.sort();
}

function readPublishManifest(publicRoot: string): Set<string> | null {
  const manifest = path.join(publicRoot, ".last-ai-publish-slugs.txt");
  if (!fs.existsSync(manifest)) return null;
  const slugs = fs
    .readFileSync(manifest, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return new Set(slugs);
}

function main(): void {
  const useManifest = process.argv.includes("--use-publish-manifest");
  const publicRoot = resolvePublicRoot();
  const aiDir = path.join(publicRoot, "ai");
  const base = getPublicBase();

  let onlySlugs: Set<string> | null = null;
  if (useManifest) {
    onlySlugs = readPublishManifest(publicRoot);
    if (!onlySlugs || onlySlugs.size === 0) {
      console.error("No client/public/.last-ai-publish-slugs.txt or empty; run without --use-publish-manifest or publish first.");
      process.exit(1);
    }
    console.log(`Restricting sitemap to ${onlySlugs.size} slugs from publish manifest.`);
  }

  const htmlFiles = listAiHtmlFiles(aiDir, onlySlugs);
  if (htmlFiles.length === 0) {
    console.error(`No HTML files under ${aiDir}`);
    process.exit(1);
  }

  const urls: { loc: string; lastmod: string; priority: string }[] = [
    { loc: `${base}/`, lastmod: new Date().toISOString().slice(0, 10), priority: "1.0" },
  ];
  for (const f of htmlFiles) {
    const fp = path.join(aiDir, f);
    const stat = fs.statSync(fp);
    const lastmod = stat.mtime.toISOString().slice(0, 10);
    const loc = `${base}/ai/${encodeURI(f)}`;
    urls.push({ loc, lastmod, priority: "0.7" });
  }

  const urlEntries = urls
    .map(
      (u) => `  <url>
    <loc>${escapeXml(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>${u.priority}</priority>
  </url>`,
    )
    .join("\n");

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`;

  const sitemapUrl = `${base}/sitemap.xml`;
  const robots = `User-agent: *
Allow: /

Sitemap: ${sitemapUrl}
`;

  fs.mkdirSync(publicRoot, { recursive: true });
  fs.writeFileSync(path.join(publicRoot, "sitemap.xml"), sitemap, "utf8");
  fs.writeFileSync(path.join(publicRoot, "robots.txt"), robots, "utf8");

  console.log(`Wrote ${urls.length} URLs → ${path.join(publicRoot, "sitemap.xml")}`);
  console.log(`Wrote robots.txt → ${path.join(publicRoot, "robots.txt")}`);
  console.log(`Submit this sitemap in Bing + Google: ${sitemapUrl}`);
}

main();
