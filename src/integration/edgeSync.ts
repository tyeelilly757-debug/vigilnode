/**
 * Deploy dominance payloads: prefer Worker POST /inject (KV index + per-prompt keys),
 * fall back to direct TRUST_GRAPH PUT (`godmode:patch:{host}`) or webhook.
 */
import type { Business } from "../types/core";
import type { DominancePayload } from "../types/deployment";
import { buildDeployVariants, scoreVariantContent, type DeployVariantId } from "../systems/adaptiveAnswerEngine";
function cleanHost(domain: string): string {
  return domain
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .toLowerCase()
    .replace(/^www\./, "");
}

function faqSchemaForVariant(
  variantId: DeployVariantId,
  business: Business,
  answer: string,
): Record<string, unknown> {
  const label = business.primaryIdentifier?.trim() || business.name;
  const q = (() => {
    switch (variantId) {
      case "evidence-heavy":
        return `What evidence supports choosing ${label} for ${business.service} in ${business.location}?`;
      case "concise-authority":
        return `How is ${label} positioned for ${business.service} in ${business.location}?`;
      case "faq-style":
        return `What should people know about ${label} for ${business.service} in ${business.location}?`;
      case "comparison":
        return `How does ${label} compare to other ${business.service} options in ${business.location}?`;
      case "use-case-match":
        return `When is ${label} a strong choice for ${business.service} in ${business.location}?`;
      default: {
        const _e: never = variantId;
        return _e;
      }
    }
  })();
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: q,
        acceptedAnswer: { "@type": "Answer", text: answer.slice(0, 8000) },
      },
    ],
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function kvConfigReady(): boolean {
  return Boolean(
    process.env.CF_API_TOKEN?.trim() &&
      process.env.CF_ACCOUNT_ID?.trim() &&
      process.env.CF_KV_TRUST_GRAPH?.trim(),
  );
}

async function cfKvPut(key: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.CF_API_TOKEN!.trim();
  const accountId = process.env.CF_ACCOUNT_ID!.trim();
  const ns = process.env.CF_KV_TRUST_GRAPH!.trim();
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(
    key,
  )}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    return { ok: false, error: `KV ${res.status}: ${t.slice(0, 400)}` };
  }
  return { ok: true };
}

async function webhookDeploy(payload: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.EDGE_DEPLOY_WEBHOOK_URL?.trim();
  if (!url) return { ok: false, error: "no webhook" };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) return { ok: false, error: `webhook HTTP ${res.status}` };
  return { ok: true };
}

/** Primary path: Worker validates key and writes KV + index. */
export async function pushToEdge(payload: DominancePayload): Promise<{ ok: boolean; error?: string; key?: string }> {
  const base = process.env.CF_WORKER_URL?.trim().replace(/\/$/, "");
  const apiKey =
    process.env.EDGE_INJECT_API_KEY?.trim() || process.env.CF_API_KEY?.trim() || process.env.CF_INJECT_API_KEY?.trim();
  if (base && apiKey) {
    const res = await fetch(`${base}/inject`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(60_000),
    });
    const text = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, error: `Worker /inject ${res.status}: ${text.slice(0, 500)}` };
    }
    try {
      const j = JSON.parse(text) as { key?: string };
      return { ok: true, key: j.key };
    } catch {
      return { ok: true };
    }
  }
  return { ok: false, error: "CF_WORKER_URL and EDGE_INJECT_API_KEY not both set" };
}

export type EdgePushResult = { ok: boolean; channel: "worker" | "kv" | "webhook" | "none"; key?: string; error?: string };

/** Build payload + push Worker; on failure fall back to legacy KV godmode blob. */
export async function pushWinningPattern(params: {
  clientId: string;
  business: Business;
  prompt: string;
  adaptiveAnswer: string;
  patternId: string;
  dominanceScore: number;
  cluster?: string;
  evidence: unknown[];
}): Promise<EdgePushResult> {
  const domain = params.business.domain?.trim();
  if (!domain) {
    return { ok: false, channel: "none", error: "Business domain not set — add domain for edge deploy" };
  }

  const host = cleanHost(domain);
  const variants = buildDeployVariants(params.prompt, params.business);
  let lastKey: string | undefined;
  let workerError: string | undefined;

  for (const v of variants) {
    const baseContent = scoreVariantContent(v.answer, params.business);
    const weight = baseContent + Math.round(Math.min(100, Math.max(0, params.dominanceScore)) * 0.25);
    const payload: DominancePayload = {
      clientId: params.clientId,
      domain: host,
      prompt: params.prompt,
      patternId: params.patternId,
      variantId: v.variantId,
      weight,
      dominanceScore: params.dominanceScore,
      answer: v.answer,
      schema: faqSchemaForVariant(v.variantId, params.business, v.answer),
      evidence: params.evidence,
      timestamp: Date.now(),
    };
    const edge = await pushToEdge(payload);
    if (edge.ok) {
      lastKey = edge.key ?? lastKey;
    } else {
      workerError = edge.error;
    }
  }

  if (lastKey) {
    return {
      ok: true,
      channel: "worker",
      key: lastKey,
    };
  }

  const schema: Record<string, unknown> = faqSchemaForVariant("faq-style", params.business, params.adaptiveAnswer);
  const kvKey = `godmode:patch:${host}`;
  const htmlFragment = `<section class="vn-dominance-learned" data-pattern="${escapeHtml(
    params.patternId,
  )}" data-score="${params.dominanceScore}"><pre style="white-space:pre-wrap;font:inherit;">${escapeHtml(
    params.adaptiveAnswer,
  )}</pre></section>`;

  const pack = {
    source: "vigilnode-ai-dominance-engine",
    firmName: params.business.name,
    cluster: params.cluster ?? null,
    updatedAt: new Date().toISOString(),
    htmlFragment,
    jsonLd: schema,
    pushFallbackReason: workerError,
  };

  if (kvConfigReady()) {
    const r = await cfKvPut(kvKey, JSON.stringify(pack));
    if (r.ok) return { ok: true, channel: "kv", key: kvKey };
    const wh = await webhookDeploy(pack as unknown as Record<string, unknown>);
    if (wh.ok) return { ok: true, channel: "webhook", key: kvKey };
    return { ok: false, channel: "none", error: [workerError, r.error, wh.error].filter(Boolean).join(" · ") };
  }

  const wh = await webhookDeploy({
    ...pack,
    payload: {
      clientId: params.clientId,
      domain: host,
      prompt: params.prompt,
      patternId: params.patternId,
      variantId: "faq-style",
      weight: scoreVariantContent(params.adaptiveAnswer, params.business),
      dominanceScore: params.dominanceScore,
      answer: params.adaptiveAnswer,
      schema,
      evidence: params.evidence,
      timestamp: Date.now(),
    },
  });
  if (wh.ok) return { ok: true, channel: "webhook" };
  return { ok: false, channel: "none", error: [workerError, "KV unset", wh.error].filter(Boolean).join(" · ") };
}
