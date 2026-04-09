import axios from "axios";
import type { ScanResult } from "../types/core";
import { extractEntities, extractFirstMention, extractNumbers } from "../utils/parser";

/** Top-level Perplexity chat completion payload: URLs live here even when body only has `[1][2]`. */
function perplexityStructuredUrls(data: unknown): string[] {
  const out: string[] = [];
  if (!data || typeof data !== "object") return out;
  const d = data as Record<string, unknown>;

  const citations = d.citations;
  if (Array.isArray(citations)) {
    for (const x of citations) {
      if (typeof x === "string" && /^https?:\/\//i.test(x.trim())) out.push(x.trim());
    }
  }

  const searchResults = d.search_results;
  if (Array.isArray(searchResults)) {
    for (const row of searchResults) {
      if (row && typeof row === "object" && "url" in row) {
        const u = (row as { url?: unknown }).url;
        if (typeof u === "string" && /^https?:\/\//i.test(u.trim())) out.push(u.trim());
      }
    }
  }

  return [...new Set(out)];
}

export async function scanPrompt(prompt: string): Promise<ScanResult> {
  const key = process.env.PERPLEXITY_API_KEY?.trim();
  if (!key) {
    throw new Error("PERPLEXITY_API_KEY is not set. Copy .env.example to .env and add your key.");
  }

  const res = await axios.post(
    "https://api.perplexity.ai/chat/completions",
    {
      model: "sonar-pro",
      messages: [{ role: "user", content: prompt }],
    },
    {
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      timeout: 120_000,
      validateStatus: () => true,
    },
  );

  if (res.status < 200 || res.status >= 300) {
    const msg = typeof res.data === "object" ? JSON.stringify(res.data).slice(0, 500) : String(res.data);
    throw new Error(`Perplexity HTTP ${res.status}: ${msg}`);
  }

  const text = res.data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("Unexpected Perplexity response shape (no choices[0].message.content).");
  }

  const apiCitations = perplexityStructuredUrls(res.data);

  return {
    prompt,
    raw: text,
    entities: extractEntities(text),
    firstMention: extractFirstMention(text),
    evidence: extractNumbers(text),
    apiCitations: apiCitations.length > 0 ? apiCitations : undefined,
  };
}
