import axios from "axios";
import type { Business, ScanResult } from "../types/core";
import { clientCitationUrls } from "../outcomes/competitorAnalysis";
import { extractCitations } from "../outcomes/extractCitations";
import { recordOutcome } from "../outcomes/outcomeTracker";
import { scanPrompt as scanPerplexity } from "../systems/truthScanner";
import { scanResultFromRaw } from "../utils/scanResult";

function mergedCitationUrls(result: ScanResult): string[] {
  const fromText = extractCitations(result.raw);
  const fromApi = result.apiCitations ?? [];
  return [...new Set([...fromText, ...fromApi])];
}

async function openaiCompletion(prompt: string): Promise<string> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    throw new Error("OPENAI_API_KEY not set");
  }
  const res = await axios.post(
    "https://api.openai.com/v1/chat/completions",
    {
      model: process.env.OPENAI_SCAN_MODEL?.trim() || "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant. Answer concisely. If the user asks for sources, links, or citations, include relevant https URLs in your answer. When listing options, name real businesses when you know them.",
        },
        { role: "user", content: prompt },
      ],
      max_tokens: 900,
      temperature: 0.3,
    },
    {
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      timeout: 120_000,
    },
  );
  const text = res.data?.choices?.[0]?.message?.content;
  if (typeof text !== "string") throw new Error("OpenAI: unexpected response shape");
  return text;
}

export async function scanOpenAI(prompt: string): Promise<ScanResult> {
  const raw = await openaiCompletion(prompt);
  return scanResultFromRaw(prompt, raw);
}

export interface MultiScanRow {
  model: string;
  result: ScanResult;
}

/** Run all configured models in parallel; skips OpenAI if key missing. */
export async function scanAllModels(
  prompt: string,
  opts?: { business?: Pick<Business, "domain"> },
): Promise<MultiScanRow[]> {
  const out: MultiScanRow[] = [];
  const tasks: Promise<void>[] = [];

  tasks.push(
    scanPerplexity(prompt).then((result) => {
      const cites = mergedCitationUrls(result);
      const clientHits = opts?.business ? clientCitationUrls(cites, opts.business) : [];
      if (clientHits.length) {
        console.log("[outcome] client domain in citations", {
          model: "perplexity",
          count: clientHits.length,
          sample: clientHits.slice(0, 5),
        });
      }
      console.log("[RAW RESPONSE]", "perplexity", {
        promptPreview: prompt.slice(0, 80),
        rawLength: result.raw.length,
        citeCount: cites.length,
        apiCitationCount: result.apiCitations?.length ?? 0,
        raw: result.raw.length > 3500 ? `${result.raw.slice(0, 3500)}…` : result.raw,
      });
      recordOutcome({
        prompt,
        model: "perplexity",
        timestamp: Date.now(),
        citations: cites,
        rawResponse: result.raw,
      });
      out.push({ model: "perplexity", result });
    }),
  );

  if (process.env.OPENAI_API_KEY?.trim()) {
    tasks.push(
      scanOpenAI(prompt).then((result) => {
        const cites = mergedCitationUrls(result);
        const clientHits = opts?.business ? clientCitationUrls(cites, opts.business) : [];
        if (clientHits.length) {
          console.log("[outcome] client domain in citations", {
            model: "openai",
            count: clientHits.length,
            sample: clientHits.slice(0, 5),
          });
        }
        console.log("[RAW RESPONSE]", "openai", {
          promptPreview: prompt.slice(0, 80),
          rawLength: result.raw.length,
          citeCount: cites.length,
          raw: result.raw.length > 3500 ? `${result.raw.slice(0, 3500)}…` : result.raw,
        });
        recordOutcome({
          prompt,
          model: "openai",
          timestamp: Date.now(),
          citations: cites,
          rawResponse: result.raw,
        });
        out.push({ model: "openai", result });
      }),
    );
  }

  await Promise.all(tasks);
  return out;
}
