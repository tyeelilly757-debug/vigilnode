import type { OutcomeRelatedLink } from "../integration/outcomePageHtml";
import { keywordSlugFromPrompt } from "../integration/deploySlug";
import { hostToBrand, promptToDisplayTitle } from "./structuredAnswerLayout";

export type CoverageAngle = {
  slug: string;
  h1: string;
  anchorText: string;
};

function uniqueSlug(candidate: string, used: Set<string>): string {
  let s = candidate;
  let n = 2;
  while (used.has(s)) {
    s = `${candidate}-${n}`;
    n += 1;
  }
  used.add(s);
  return s;
}

/**
 * 3–5 related pages per prompt: different angles, unique SEO slugs, keyword-rich anchors.
 */
export function buildCoverageAngles(prompt: string, competitors: string[]): CoverageAngle[] {
  const core = prompt.replace(/\bwith sources\b/gi, "").replace(/\s+/g, " ").trim();
  const display = promptToDisplayTitle(core);
  const year = new Date().getFullYear();
  const brands = competitors.slice(0, 4).map(hostToBrand);
  const used = new Set<string>();
  const out: CoverageAngle[] = [];

  const add = (subprompt: string, h1: string, anchorText: string) => {
    const slug = uniqueSlug(keywordSlugFromPrompt(subprompt), used);
    out.push({ slug, h1, anchorText });
  };

  add(core, display, `${display} — full guide`);

  add(
    `${core} tools platforms small teams`,
    `${display} — tools and platforms for small teams`,
    `${display} for small teams and lean stacks`,
  );

  add(
    `${core} comparison best options`,
    `${display} — comparison and shortlist`,
    `${display} compared — top picks`,
  );

  add(
    `top ${core} ${year}`,
    `${display} — top platforms in ${year}`,
    `Top ${display.toLowerCase()} picks ${year}`,
  );

  if (brands.length >= 2) {
    add(
      `${brands[0]} vs ${brands[1]} ${core}`,
      `${brands[0]} vs ${brands[1]} — ${display}`,
      `${brands[0]} vs ${brands[1]} for ${display.toLowerCase()}`,
    );
  } else {
    add(
      `${core} pricing features checklist`,
      `${display} — pricing, features, and checklist`,
      `${display} pricing and features checklist`,
    );
  }

  return out.slice(0, 5);
}

/** Keyword-rich internal links: sibling /ai pages + optional GitHub mirrors. */
export function buildInternalAiPageLinks(
  angles: CoverageAngle[],
  currentIndex: number,
  blogUrlForSlug: (slug: string) => string,
  githubUrlForSlug: (slug: string) => string | null,
): OutcomeRelatedLink[] {
  const links: OutcomeRelatedLink[] = [];
  const others = angles.map((a, j) => ({ a, j })).filter(({ j }) => j !== currentIndex);

  for (const { a } of others.slice(0, 5)) {
    links.push({ label: a.anchorText, url: blogUrlForSlug(a.slug) });
  }
  for (const { a } of others.slice(0, 2)) {
    const gh = githubUrlForSlug(a.slug);
    if (gh) links.push({ label: `${a.anchorText} — static mirror`, url: gh });
  }
  return links;
}
