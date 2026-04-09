import "dotenv/config";
import axios from "axios";

const prompt =
  process.argv[2]?.trim() ||
  "best crm software for small business include direct website links";

async function httpProbe() {
  const key = process.env.PERPLEXITY_API_KEY?.trim();
  if (!key) throw new Error("PERPLEXITY_API_KEY missing");

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

  console.log("status", res.status);
  console.log("topKeys", Object.keys(res.data ?? {}));

  const c = res.data?.choices?.[0];
  console.log("choiceKeys", c ? Object.keys(c) : null);
  const msg = c?.message;
  console.log("messageKeys", msg ? Object.keys(msg) : null);

  for (const k of ["citations", "search_results", "sources"] as const) {
    if (res.data?.[k] != null) console.log(k, JSON.stringify(res.data[k]).slice(0, 800));
  }

  const text = msg?.content;
  const hasHttp = typeof text === "string" && /https?:\/\//.test(text);
  console.log("contentHasHttp", hasHttp);
  console.log("contentSample\n", typeof text === "string" ? text.slice(0, 2000) : text);
}

async function scannerProbe() {
  const { scanPrompt } = await import("../src/systems/truthScanner.ts");
  const prompt = process.argv[3]?.trim() || "best crm software for small business";
  const r = await scanPrompt(prompt);
  console.log("scanPrompt apiCitations count", r.apiCitations?.length ?? 0);
  console.log("sample", r.apiCitations?.slice(0, 5));
}

async function main() {
  if (process.argv.includes("--scan")) {
    await scannerProbe();
    return;
  }
  await httpProbe();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
