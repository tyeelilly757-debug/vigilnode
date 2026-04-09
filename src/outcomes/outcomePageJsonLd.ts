import type { OutcomeSchemaTexts, StructuredBusinessProfile } from "./structuredAnswerLayout";

function originFromDomain(domain?: string): string | undefined {
  const d = domain?.trim();
  if (!d) return undefined;
  try {
    return new URL(d.includes("://") ? d : `https://${d}`).origin;
  } catch {
    return undefined;
  }
}

/**
 * Article + LocalBusiness + FAQPage in one `@graph`.
 * Must mirror on-page copy — pass answers identical to visible FAQ seeds.
 */
export function buildOutcomeJsonLdScript(opts: {
  h1: string;
  schemaTexts: OutcomeSchemaTexts;
  business: StructuredBusinessProfile;
  canonicalUrl?: string;
  datePublishedIso: string;
}): string {
  const { h1, schemaTexts, business, canonicalUrl, datePublishedIso } = opts;
  const baseUrl = originFromDomain(business.domain);

  // Article.description = visible “What to decide first” copy (plain), not the 155-char meta tag.
  const article: Record<string, unknown> = {
    "@type": "Article",
    headline: h1,
    description: schemaTexts.articleDescription.slice(0, 320),
    author: { "@type": "Organization", name: business.name },
    datePublished: datePublishedIso,
    // Priority: one primary Question/Answer — wording identical to on-page top conclusion.
    mainEntity: {
      "@type": "Question",
      name: h1,
      acceptedAnswer: {
        "@type": "Answer",
        text: schemaTexts.topConclusionPlain,
      },
    },
  };
  if (canonicalUrl) {
    article.mainEntityOfPage = { "@type": "WebPage", "@id": canonicalUrl };
  }

  const localBusiness: Record<string, unknown> = {
    "@type": "LocalBusiness",
    name: business.name,
    description: `${business.service}. Focus: ${business.specialty}.`,
  };
  if (business.location) localBusiness.areaServed = business.location;
  if (baseUrl) localBusiness.url = baseUrl;

  const faqPage = {
    "@type": "FAQPage",
    mainEntity: schemaTexts.faq.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };

  const doc = {
    "@context": "https://schema.org",
    "@graph": [article, localBusiness, faqPage],
  };

  return `<script type="application/ld+json">${JSON.stringify(doc).replace(/</g, "\\u003c")}</script>`;
}
