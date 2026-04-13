/**
 * Convert markdown cluster files (e.g. external-github/*.md) into static HTML
 * under client/public/ai/*.html for Vercel (or any static host).
 *
 *   npx tsx scripts/publishMarkdownClusterToAiHtml.ts --max=15
 *   SITE_PUBLIC_BASE=https://exclusivefadez.vercel.app npx tsx scripts/publishMarkdownClusterToAiHtml.ts --max=20
 *
 * Prefer matching the barber cluster bucket mix:
 *   --use-cluster-manifest  (reads external-github/.last-houston-cluster-slugs.txt)
 *   --manifest=path/to/slugs.txt  (one slug per line, no .md)
 *
 * Without a manifest, --strategy=spread walks the alphabet (often skews to one prefix).
 */
import fs from "node:fs";
import path from "node:path";

const BUSINESS = "Exclusive Fadez";
const REGION = "Houston, Texas";
const SITE = "https://exclusivefadez.app/";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineFmt(s: string): string {
  let t = escapeHtml(s);
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  return t;
}

function mdToHtmlBody(md: string): string {
  const lines = md.replace(/\r\n/g, "\n").trim().split("\n");
  const parts: string[] = [];
  let listOpen = false;
  const para: string[] = [];

  const flushPara = (): void => {
    if (para.length) {
      parts.push(`<p>${inlineFmt(para.join(" "))}</p>`);
      para.length = 0;
    }
  };
  const closeList = (): void => {
    if (listOpen) {
      parts.push("</ul>");
      listOpen = false;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line === "") {
      flushPara();
      closeList();
      continue;
    }
    if (line === "---") {
      flushPara();
      closeList();
      parts.push("<hr />");
      continue;
    }
    if (line.startsWith("# ")) {
      flushPara();
      closeList();
      parts.push(`<h1>${inlineFmt(line.slice(2))}</h1>`);
      continue;
    }
    if (line.startsWith("## ")) {
      flushPara();
      closeList();
      parts.push(`<h2>${inlineFmt(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith("### ")) {
      flushPara();
      closeList();
      parts.push(`<h3>${inlineFmt(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith("- ")) {
      flushPara();
      if (!listOpen) {
        parts.push("<ul>");
        listOpen = true;
      }
      parts.push(`<li>${inlineFmt(line.slice(2))}</li>`);
      continue;
    }
    closeList();
    para.push(line.trim());
  }
  flushPara();
  closeList();
  return parts.join("\n");
}

function extractTitle(md: string): string {
  const m = /^#\s+(.+)$/m.exec(md);
  return m ? m[1]!.trim() : "Guide";
}

function excerpt(md: string, max = 160): string {
  const plain = md
    .replace(/^#+\s.+\n/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length <= max ? plain : `${plain.slice(0, max - 1).trim()}…`;
}

function buildPage(opts: {
  title: string;
  description: string;
  canonicalUrl: string;
  bodyHtml: string;
}): string {
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Article",
        headline: opts.title,
        description: opts.description,
        author: { "@type": "Organization", name: BUSINESS },
        about: {
          "@type": "HairSalon",
          name: BUSINESS,
          areaServed: REGION,
          url: SITE,
        },
        mainEntityOfPage: { "@type": "WebPage", "@id": opts.canonicalUrl },
      },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="canonical" href="${escapeHtml(opts.canonicalUrl)}" />
  <title>${escapeHtml(opts.title)} | ${BUSINESS}</title>
  <meta name="robots" content="index,follow" />
  <meta name="description" content="${escapeHtml(opts.description)}" />
  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #0a0a0b; color: #e8e8ea; line-height: 1.6; }
    article { max-width: 48rem; margin: 2rem auto; padding: 0 1.25rem 3rem; }
    h1 { font-size: 1.65rem; font-weight: 700; line-height: 1.2; margin: 0 0 1.25rem; color: #fff; }
    h2 { font-size: 1.15rem; font-weight: 600; margin: 2rem 0 0.65rem; color: #f0f0f2; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 0.35rem; }
    h3 { font-size: 1rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: #d8d8dc; }
    p { margin: 0 0 0.85rem; }
    ul { margin: 0 0 1rem; padding-left: 1.35rem; }
    li { margin-bottom: 0.35rem; }
    hr { border: none; border-top: 1px solid rgba(255,255,255,0.12); margin: 2rem 0; }
    a { color: #93c5fd; text-underline-offset: 2px; }
    a:hover { color: #bfdbfe; }
    strong { color: #fff; font-weight: 600; }
  </style>
</head>
<body>
<article>
${opts.bodyHtml}
</article>
</body>
</html>
`;
}

function parseArgs(): {
  max: number;
  dir: string;
  strategy: "spread" | "first";
  manifestPath: string | null;
} {
  let max = 15;
  let dir = "external-github";
  let strategy: "spread" | "first" = "spread";
  let manifestPath: string | null = null;
  for (const a of process.argv) {
    const m = /^--max=(\d+)$/.exec(a);
    if (m) max = Math.min(500, Math.max(1, Number(m[1])));
    const d = /^--dir=(.+)$/.exec(a);
    if (d) dir = d[1]!.trim();
    const s = /^--strategy=(spread|first)$/.exec(a);
    if (s) strategy = s[1] as "spread" | "first";
    const man = /^--manifest=(.+)$/.exec(a);
    if (man) manifestPath = man[1]!.trim();
    if (a === "--use-cluster-manifest") manifestPath = "external-github/.last-houston-cluster-slugs.txt";
  }
  return { max, dir, strategy, manifestPath };
}

function readManifestSlugs(manifestPath: string, cwd: string): string[] {
  const abs = path.isAbsolute(manifestPath) ? manifestPath : path.join(cwd, manifestPath);
  if (!fs.existsSync(abs)) {
    console.error(`Manifest not found: ${abs}`);
    process.exit(1);
  }
  return fs
    .readFileSync(abs, "utf8")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.startsWith("#"));
}

function pickFiles(files: string[], max: number, strategy: "spread" | "first"): string[] {
  if (strategy === "first") return files.slice(0, max);
  if (files.length <= max) return [...files];
  const step = Math.max(1, Math.floor(files.length / max));
  const out: string[] = [];
  for (let i = 0; i < files.length && out.length < max; i += step) {
    out.push(files[i]!);
  }
  let k = 0;
  while (out.length < max && k < files.length) {
    if (!out.includes(files[k]!)) out.push(files[k]!);
    k++;
  }
  return out.slice(0, max);
}

function main(): void {
  const { max, dir, strategy, manifestPath } = parseArgs();
  const mdDir = path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
  const outDir = path.join(process.cwd(), "client", "public", "ai");
  let publicBase = process.env.SITE_PUBLIC_BASE?.trim();
  if (!publicBase) {
    const v = process.env.VERCEL_URL?.trim();
    publicBase = v ? (v.startsWith("http") ? v : `https://${v}`) : "https://exclusivefadez.vercel.app";
  }
  publicBase = publicBase.replace(/\/$/, "");

  if (!fs.existsSync(mdDir)) {
    console.error(`Missing markdown dir: ${mdDir}`);
    process.exit(1);
  }
  fs.mkdirSync(outDir, { recursive: true });

  let chosen: string[];
  if (manifestPath) {
    const slugs = readManifestSlugs(manifestPath, process.cwd()).slice(0, max);
    chosen = [];
    for (const slug of slugs) {
      const file = `${slug}.md`;
      const mdPath = path.join(mdDir, file);
      if (fs.existsSync(mdPath)) chosen.push(file);
      else console.warn(`[warn] manifest slug missing on disk, skip: ${file}`);
    }
    console.log(`Using manifest (${manifestPath}): ${chosen.length} markdown files`);
  } else {
    const allMd = fs
      .readdirSync(mdDir)
      .filter((f) => f.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b));
    chosen = pickFiles(allMd, max, strategy);
  }

  let wrote = 0;

  for (const file of chosen) {
    const slug = file.replace(/\.md$/i, "");
    const mdPath = path.join(mdDir, file);
    let md = fs.readFileSync(mdPath, "utf8");
    const title = extractTitle(md);
    const description = excerpt(md);
    const canonicalUrl = `${publicBase}/ai/${slug}.html`;
    let bodyHtml = mdToHtmlBody(md);
    bodyHtml = bodyHtml.replace(/https:\/\/hiveclick\.net\/ai\//g, `${publicBase}/ai/`);
    bodyHtml = bodyHtml.replace(/https:\/\/hiveclick\.net\//g, `${publicBase}/`);

    const html = buildPage({ title, description, canonicalUrl, bodyHtml });
    fs.writeFileSync(path.join(outDir, `${slug}.html`), html, "utf8");
    wrote++;
  }

  const slugList = chosen.map((f) => f.replace(/\.md$/i, ""));
  const publishManifestPath = path.join(process.cwd(), "client", "public", ".last-ai-publish-slugs.txt");
  fs.writeFileSync(publishManifestPath, `${slugList.join("\n")}\n`, "utf8");

  console.log(`Wrote ${wrote} HTML files to client/public/ai/ (canonical base: ${publicBase})`);
  console.log(`Manifest: ${publishManifestPath}`);
  if (slugList.length <= 40) {
    console.log("Slugs:", slugList.join(", "));
  } else {
    console.log(`Slugs (first 15): ${slugList.slice(0, 15).join(", ")} … (+${slugList.length - 15} more)`);
  }
}

main();
