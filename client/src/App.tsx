import { useCallback, useEffect, useState } from "react";
import { LearningMaturitySection } from "./LearningMaturitySection";

type BusinessForm = {
  name: string;
  service: string;
  location: string;
  specialty: string;
  top_case: string;
  case_example: string;
  domain: string;
};

const defaultBiz: BusinessForm = {
  name: "VigilNode Legal Group",
  service: "trucking accident lawyer",
  location: "Sacramento",
  specialty: "catastrophic injury and trucking litigation",
  top_case: "$4.2M settlement",
  case_example: "multi-vehicle highway collisions",
  domain: "",
};

type JobResult = {
  job: {
    id: string;
    status: string;
    error: string | null;
    summary: {
      dominanceScore: number;
      promptCoverage: number;
      modelsUsed: string[];
      avgBaselineScore: number;
      avgAfterScore: number;
      scansTotal: number;
      avgConsensusBaseline?: number;
      avgConsensusAfter?: number;
      learningWrites?: number;
      avgPromptOwnership?: number;
      decayEvents?: number;
      edgeDeployed?: boolean;
      promptClusters?: Record<string, string[]>;
    } | null;
  };
  business: BusinessForm | null;
  prompts: Array<{
    id: string;
    promptText: string;
    scans: Array<{ id: string; model: string; phase: string; score: number; rawExcerpt: string }>;
  }>;
};

export default function App() {
  const [form, setForm] = useState<BusinessForm>(defaultBiz);
  const [jobId, setJobId] = useState<string | null>(null);
  const [result, setResult] = useState<JobResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const poll = useCallback(async (id: string) => {
    const r = await fetch(`/api/jobs/${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error(await r.text());
    const data = (await r.json()) as JobResult;
    setResult(data);
    return data.job.status;
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    const tick = async () => {
      try {
        const st = await poll(jobId);
        if (stopped) return;
        if (st === "pending" || st === "running") {
          setTimeout(tick, 2500);
        }
      } catch (e) {
        if (!stopped) setErr(e instanceof Error ? e.message : String(e));
      }
    };
    void tick();
    return () => {
      stopped = true;
    };
  }, [jobId, poll]);

  async function submit() {
    setErr(null);
    setBusy(true);
    setResult(null);
    try {
      const { domain, ...rest } = form;
      const r = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business: { ...rest, ...(domain.trim() ? { domain: domain.trim() } : {}) },
        }),
      });
      const j = (await r.json()) as { jobId?: string; error?: string };
      if (!r.ok) throw new Error(j.error ?? r.statusText);
      if (!j.jobId) throw new Error("No jobId");
      setJobId(j.jobId);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const s = result?.job.summary;
  const youVis = s ? Math.min(100, s.avgAfterScore) : null;
  const compVis = youVis != null ? Math.min(100, youVis + 32) : null;
  const recovered =
    youVis != null && compVis != null && compVis > youVis
      ? Math.round((compVis - youVis) * 1200)
      : null;

  return (
    <div style={{ maxWidth: 920, margin: "0 auto", padding: "2rem 1.25rem" }}>
      <header style={{ marginBottom: "2rem" }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem", letterSpacing: "-0.02em" }}>AI dominance engine</h1>
        <p style={{ margin: "0.5rem 0 0", color: "rgba(232,232,234,0.55)", fontSize: "0.9rem" }}>
          Learning layer: pattern memory, model behavior profiles, consensus, adaptive answers.
        </p>
      </header>

      <LearningMaturitySection />

      <section
        style={{
          display: "grid",
          gap: "0.75rem",
          marginBottom: "2rem",
          padding: "1.25rem",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 8,
          background: "rgba(255,255,255,0.02)",
        }}
      >
        {(Object.keys(form) as (keyof BusinessForm)[]).map((k) => (
          <label key={k} style={{ display: "grid", gap: 4, fontSize: "0.8rem", textTransform: "capitalize" }}>
            {k === "domain" ? "domain (https root, e.g. https://hiveclick.net)" : k.replace(/_/g, " ")}
            <input
              value={form[k]}
              onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              style={{
                padding: "0.5rem 0.65rem",
                borderRadius: 6,
                border: "1px solid rgba(255,255,255,0.12)",
                background: "#111",
                color: "#eee",
              }}
            />
          </label>
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => void submit()}
          style={{
            marginTop: 8,
            padding: "0.65rem 1rem",
            fontWeight: 600,
            border: "none",
            borderRadius: 6,
            background: busy ? "#333" : "#0d9488",
            color: "#fff",
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Starting…" : "Run dominance audit"}
        </button>
      </section>

      {err ? (
        <p style={{ color: "#f87171" }} role="alert">
          {err}
        </p>
      ) : null}

      {jobId ? (
        <p style={{ fontSize: "0.85rem", color: "rgba(232,232,234,0.5)" }}>
          Job <code>{jobId}</code> — {result?.job.status ?? "…"}
        </p>
      ) : null}

      {s && result?.job.status === "completed" ? (
        <section style={{ marginTop: "2rem" }}>
          <h2 style={{ fontSize: "1.1rem" }}>Snapshot</h2>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
              gap: "1rem",
              marginTop: "1rem",
            }}
          >
            <Metric label="Dominance score (composite)" value={String(s.dominanceScore)} />
            <Metric label="Prompt coverage" value={String(s.promptCoverage)} />
            <Metric label="Models" value={s.modelsUsed.join(", ")} />
            <Metric label="Avg baseline score" value={String(s.avgBaselineScore)} />
            <Metric label="Avg after score" value={String(s.avgAfterScore)} />
            <Metric label="Total scans" value={String(s.scansTotal)} />
            <Metric
              label="Cross-model consensus (baseline)"
              value={s.avgConsensusBaseline != null ? `${Math.round(s.avgConsensusBaseline * 100)}%` : "—"}
            />
            <Metric
              label="Cross-model consensus (after)"
              value={s.avgConsensusAfter != null ? `${Math.round(s.avgConsensusAfter * 100)}%` : "—"}
            />
            <Metric label="Learning writes (job)" value={String(s.learningWrites ?? "—")} />
            <Metric
              label="Prompt ownership (avg)"
              value={s.avgPromptOwnership != null ? `${Math.round(s.avgPromptOwnership * 100)}%` : "—"}
            />
            <Metric label="Decay events" value={String(s.decayEvents ?? "—")} />
            <Metric label="Edge deployed" value={s.edgeDeployed === true ? "yes" : s.edgeDeployed === false ? "no" : "—"} />
          </div>

          {s.promptClusters && Object.keys(s.promptClusters).length > 0 ? (
            <div style={{ marginTop: "1.25rem", fontSize: "0.8rem", color: "rgba(232,232,234,0.5)" }}>
              <div style={{ marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.08em" }}>Topic clusters</div>
              {Object.entries(s.promptClusters).map(([c, ps]) => (
                <div key={c} style={{ marginBottom: 6 }}>
                  <strong style={{ color: "rgba(232,232,234,0.75)" }}>{c}</strong>: {ps.length} prompt(s)
                </div>
              ))}
            </div>
          ) : null}

          <h3 style={{ marginTop: "2rem", fontSize: "1rem" }}>Narrative (illustrative)</h3>
          <p style={{ color: "rgba(232,232,234,0.65)", fontSize: "0.9rem" }}>
            You: ~{youVis}% modeled visibility · Competitor (stub +32pts): ~{compVis}%
            {recovered != null ? (
              <>
                {" "}
                → illustrative recovered-attention band: <strong>${recovered.toLocaleString()}/mo</strong> at your
                intake assumptions.
              </>
            ) : null}
          </p>

          <h3 style={{ marginTop: "1.5rem", fontSize: "1rem" }}>By prompt</h3>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {result.prompts.map((p) => (
              <li
                key={p.id}
                style={{
                  marginBottom: "1rem",
                  padding: "0.75rem",
                  background: "rgba(255,255,255,0.03)",
                  borderRadius: 6,
                }}
              >
                <div style={{ fontSize: "0.85rem", marginBottom: 8 }}>{p.promptText}</div>
                <div style={{ fontSize: "0.75rem", color: "rgba(232,232,234,0.5)" }}>
                  {p.scans.map((sc) => (
                    <div key={sc.id}>
                      [{sc.model} / {sc.phase}] score {sc.score}
                    </div>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {result?.job.status === "failed" && result.job.error ? (
        <p style={{ color: "#f87171" }}>Job failed: {result.job.error}</p>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.06em", color: "rgba(232,232,234,0.45)" }}>
        {label}
      </div>
      <div style={{ fontSize: "1.05rem", marginTop: 4 }}>{value}</div>
    </div>
  );
}
