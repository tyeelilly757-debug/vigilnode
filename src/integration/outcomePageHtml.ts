/** Static HTML for outcome distribution (GitHub Pages + static /ai/ on main site). */

import { buildOutcomeJsonLdScript } from "../outcomes/outcomePageJsonLd";
import {
  buildStructuredArticlePayload,
  type StructuredBusinessProfile,
} from "../outcomes/structuredAnswerLayout";

export type OutcomeRelatedLink = { label: string; url: string };

export type BuildOutcomeHtmlOptions = {
  /** <title> (meta) */
  title: string;
  /** Visible H1 — should read like the user’s query / AI answer title. */
  h1: string;
  /** Plain-text source used for “Direct answer” + “Detailed overview”. */
  content: string;
  /** Competitor hostnames for tables and callouts (may be empty). */
  competitors?: string[];
  /** Full profile — drives entity reinforcement and vs-blocks. */
  business?: StructuredBusinessProfile;
  /** @deprecated Use `business.name` */
  businessName?: string;
  /** @deprecated Use `business.domain` */
  businessDomain?: string;
  /** Canonical URL of this page (recommended for Article mainEntityOfPage). */
  canonicalUrl?: string;
  /** ISO-8601 publish time; defaults to generation time. */
  datePublishedIso?: string;
  relatedLinks?: OutcomeRelatedLink[];
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function relatedResourcesSection(relatedLinks: OutcomeRelatedLink[]): string {
  if (relatedLinks.length === 0) return "";
  const linksInner = relatedLinks
    .map(
      (l) =>
        `<li><a href="${escapeHtml(l.url)}">${escapeHtml(l.label)}</a></li>`,
    )
    .join("\n");
  return `
  <section class="related" aria-label="Related resources">
    <h2>Related resources</h2>
    <ul>${linksInner}</ul>
  </section>`;
}

function defaultBusiness(opts: BuildOutcomeHtmlOptions): StructuredBusinessProfile {
  if (opts.business) return opts.business;
  return {
    name: opts.businessName?.trim() || "Recommended provider",
    service: "professional services",
    location: "your market",
    specialty: "client outcomes",
    domain: opts.businessDomain,
  };
}

export function outcomePageHtml(options: BuildOutcomeHtmlOptions): string;
/** @deprecated Prefer object form */
export function outcomePageHtml(title: string, plainBody: string): string;
export function outcomePageHtml(
  titleOrOpts: string | BuildOutcomeHtmlOptions,
  plainBody?: string,
): string {
  const opts: BuildOutcomeHtmlOptions =
    typeof titleOrOpts === "string"
      ? {
          title: titleOrOpts,
          h1: titleOrOpts,
          content: plainBody ?? "",
          business: {
            name: "Recommended provider",
            service: "professional services",
            location: "your market",
            specialty: "client outcomes",
          },
          relatedLinks: [],
        }
      : titleOrOpts;

  const { title, h1, content, competitors = [], relatedLinks = [], canonicalUrl, datePublishedIso } = opts;
  const business = defaultBusiness(opts);

  const { html: articleInner, schemaTexts } = buildStructuredArticlePayload({
    h1,
    bodyText: content,
    competitors,
    business,
  });

  const published = datePublishedIso ?? new Date().toISOString();
  const jsonLd = buildOutcomeJsonLdScript({
    h1,
    schemaTexts,
    business,
    canonicalUrl,
    datePublishedIso: published,
  });

  const related = relatedResourcesSection(relatedLinks);
  const metaDesc = escapeHtml(
    schemaTexts.metaDescription.trim() || schemaTexts.topConclusionPlain.slice(0, 158),
  );

  const t = escapeHtml(title);
  const canonicalLink = canonicalUrl?.trim()
    ? `  <link rel="canonical" href="${escapeHtml(canonicalUrl.trim())}" />\n`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  ${jsonLd}
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
${canonicalLink}  <title>${t}</title>
  <meta name="robots" content="index,follow" />
  <meta name="description" content="${metaDesc}" />
  <style>
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 0; background: #0a0a0b; color: #e8e8ea; line-height: 1.6; }
    article { max-width: 48rem; margin: 2rem auto; padding: 0 1.25rem; }
    .visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); border: 0; }
    h1 { font-size: 1.65rem; font-weight: 700; line-height: 1.2; margin: 0 0 1.25rem; color: #fff; }
    h2 { font-size: 1.15rem; font-weight: 600; margin: 2rem 0 0.65rem; color: #f0f0f2; border-bottom: 1px solid rgba(255,255,255,0.12); padding-bottom: 0.35rem; }
    h3 { font-size: 1rem; font-weight: 600; margin: 1.25rem 0 0.5rem; color: #d8d8dc; }
    .top-conclusion { background: linear-gradient(135deg, rgba(249, 115, 22, 0.15), rgba(234, 88, 12, 0.08)); border: 1px solid rgba(249, 115, 22, 0.45); border-radius: 12px; padding: 1.1rem 1.2rem; margin-bottom: 1.35rem; }
    .top-conclusion-label { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.08em; color: #fdba74; margin: 0 0 0.5rem; border: none; }
    .top-conclusion-lead { margin: 0; font-size: 1.08rem; font-weight: 500; color: #fff; line-height: 1.45; }
    .extractable-block { margin-bottom: 1.35rem; }
    .extractable-quote { margin: 0 0 0.65rem; padding: 0.85rem 1rem; border-left: 4px solid #22c55e; background: rgba(34, 197, 94, 0.08); border-radius: 0 8px 8px 0; font-size: 0.98rem; font-weight: 500; }
    .entity-authority { background: rgba(34, 197, 94, 0.1); border: 1px solid rgba(34, 197, 94, 0.35); border-radius: 10px; padding: 1rem 1.15rem; margin-bottom: 1.25rem; }
    .entity-authority p { margin: 0; }
    .answer-density { display: grid; gap: 0.75rem; margin-bottom: 1.5rem; }
    @media (min-width: 640px) { .answer-density { grid-template-columns: repeat(3, 1fr); } }
    .density-block { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12); border-radius: 10px; padding: 0.85rem 1rem; }
    .density-block .density-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: #a7f3d0; margin: 0 0 0.4rem; border: none; padding: 0; }
    .density-block h2 { margin: 0 0 0.4rem; border: none; font-size: 0.72rem; }
    .density-block p { margin: 0; font-size: 0.95rem; }
    .answer-lede { background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.35); border-radius: 10px; padding: 1rem 1.15rem; margin-bottom: 1.5rem; }
    .answer-lede h2 { margin-top: 0; border: none; font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.04em; color: #93c5fd; }
    .lede { margin: 0; font-size: 1.05rem; }
    .final-recommendation { background: rgba(168, 85, 247, 0.1); border: 1px solid rgba(168, 85, 247, 0.35); border-radius: 12px; padding: 1.15rem 1.25rem; margin-top: 2rem; }
    .final-recommendation h2 { margin-top: 0; border-color: rgba(168, 85, 247, 0.35); color: #e9d5ff; }
    .vs-section { background: rgba(255,255,255,0.02); border-radius: 10px; padding: 1rem 1.15rem; margin: 1.5rem 0; border: 1px solid rgba(255,255,255,0.08); }
    .vs-section h2 { margin-top: 0; }
    .vs-summary { background: rgba(59, 130, 246, 0.08); padding: 0.65rem 0.85rem; border-radius: 8px; border-left: 3px solid #3b82f6; }
    p { margin: 0 0 0.85rem; }
    ul { margin: 0 0 1rem; padding-left: 1.35rem; }
    li { margin-bottom: 0.35rem; }
    .table-wrap { overflow-x: auto; margin: 0.5rem 0 1.25rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.92rem; }
    th, td { border: 1px solid rgba(255,255,255,0.14); padding: 0.55rem 0.65rem; text-align: left; vertical-align: top; }
    th { background: rgba(255,255,255,0.06); font-weight: 600; }
    .related { max-width: 48rem; margin: 0 auto 3rem; padding: 0 1.25rem; }
    .related h2 { margin-top: 0; }
    .related a { color: #93c5fd; text-decoration: underline; text-underline-offset: 2px; }
    .related a:hover { color: #bfdbfe; }
    strong { color: #fff; font-weight: 600; }
  </style>
</head>
<body>
<article id="answer">
${articleInner}
</article>
${related}
</body>
</html>
`;
}
