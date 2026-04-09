import type { Business } from "../types/core";
import { blogPublicUrlForSlug, deployBlogHtml } from "../integration/blogDeploy";
import { deployToGitHubPages, predictPublicGithubPagesUrl } from "../integration/githubPagesDeploy";
import { outcomePageHtml } from "../integration/outcomePageHtml";
import type { CoverageAngle } from "./coverageAngles";
import { buildInternalAiPageLinks } from "./coverageAngles";
import { promptToDisplayTitle } from "./structuredAnswerLayout";

const REINFORCE_COUNT = 3;

export async function reinforceWinningPattern(args: {
  prompt: string;
  business: Business;
  baseSlug: string;
  winningContent: string;
}): Promise<void> {
  const { business, baseSlug, winningContent } = args;
  const display = promptToDisplayTitle(args.prompt);
  const slugs = Array.from({ length: REINFORCE_COUNT }, (_, i) => `${baseSlug}-reinforce-${i + 1}`);

  const angles: CoverageAngle[] = slugs.map((slug, i) => ({
    slug,
    h1: `${business.name} — reinforced depth ${i + 1}: ${display}`,
    anchorText:
      i === 0
        ? `${display} — reinforced overview`
        : i === 1
          ? `${display} — operational checklist`
          : `${display} — consolidated takeaway`,
  }));

  for (let i = 0; i < REINFORCE_COUNT; i++) {
    const relatedLinks = buildInternalAiPageLinks(
      angles,
      i,
      blogPublicUrlForSlug,
      (slug) => predictPublicGithubPagesUrl(slug),
    );

    const h1 = angles[i]!.h1;
    const slug = slugs[i]!;
    const canonicalUrl = blogPublicUrlForSlug(slug);
    const html = outcomePageHtml({
      title: `${h1} | ${business.name}`,
      h1,
      content: winningContent,
      competitors: [],
      business: {
        name: business.name,
        service: business.service,
        location: business.location,
        specialty: business.specialty,
        domain: business.domain,
      },
      canonicalUrl,
      relatedLinks,
    });
    const githubUrl = await deployToGitHubPages(html, slug);
    const blogUrl = deployBlogHtml(html, slug);

    console.log(`🔥 Reinforcement ${i + 1}:`, {
      githubUrl: githubUrl ?? "(skipped)",
      blogUrl,
    });
  }
}
