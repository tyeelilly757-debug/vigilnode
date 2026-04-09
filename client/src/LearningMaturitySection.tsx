import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ConfidenceRing } from "./ConfidenceRing";
import {
  aiVisibilityScore,
  FOCUS_INTENT_REASONING,
  formatConfidenceLabel,
  formatVisibilityScoreDelta,
  momentumDisplayLabel,
  momentumFromTrend,
  pickFocusIntentKey,
  pollWindowHintSeconds,
  systemNarrative,
  uncertaintyLabel,
  visibilityOutcomeLine,
  visibilityScoreMeaningLine,
  type TargetedExploreStatsPayload,
} from "./learningCopy";
import {
  confidenceLabelColor,
  momentumKindColor,
  phaseStateColor,
  TOOLTIP_CONFIDENCE,
  TOOLTIP_UNCERTAINTY,
  trendDeltaColor,
} from "./learningUiSemantics";

const POLL_MS = 5000;
const SCORE_REVEAL_DELAY_MS = 230;
const ONBOARDING_KEY = "vigilnode-learning-onboarding-dismissed";

const helpCursor: CSSProperties = {
  cursor: "help",
  borderBottom: "1px dotted rgba(232,232,234,0.32)",
};

function readOnboardingDismissed(): boolean {
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function LearningMaturitySection() {
  const [stats, setStats] = useState<TargetedExploreStatsPayload | null>(null);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [laggedScore, setLaggedScore] = useState<number | null>(null);
  const [displayedDelta, setDisplayedDelta] = useState<number | null>(null);
  const prevScoreRef = useRef<number | null>(null);
  const firstRevealRef = useRef(true);
  const prevLaggedScoreForPulseRef = useRef<number | null>(null);
  const [scoreRingPulse, setScoreRingPulse] = useState(false);
  const prevIntentDisplayRef = useRef<Record<string, number>>({});
  const [intentRingPulseByKey, setIntentRingPulseByKey] = useState<Record<string, boolean>>({});
  const [showOnboarding, setShowOnboarding] = useState(() => !readOnboardingDismissed());

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const r = await fetch("/api/learning/targeted-explore-stats");
        if (!r.ok) throw new Error(await r.text());
        const data = (await r.json()) as TargetedExploreStatsPayload;
        if (!cancelled) {
          setStats(data);
          setFetchErr(null);
        }
      } catch (e) {
        if (!cancelled) setFetchErr(e instanceof Error ? e.message : String(e));
      }
    }

    void load();
    const id = window.setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  useEffect(() => {
    if (!stats) return;
    const target = aiVisibilityScore(stats);
    const delay = firstRevealRef.current ? 0 : SCORE_REVEAL_DELAY_MS;
    const timer = window.setTimeout(() => {
      const prev = prevScoreRef.current;
      setDisplayedDelta(prev === null ? null : target - prev);
      prevScoreRef.current = target;
      setLaggedScore(target);
      firstRevealRef.current = false;
    }, delay);
    return () => window.clearTimeout(timer);
  }, [stats]);

  useEffect(() => {
    if (laggedScore == null) return;
    const prev = prevLaggedScoreForPulseRef.current;
    if (prev !== null && laggedScore > prev) {
      setScoreRingPulse(true);
      const t = window.setTimeout(() => setScoreRingPulse(false), 280);
      prevLaggedScoreForPulseRef.current = laggedScore;
      return () => window.clearTimeout(t);
    }
    prevLaggedScoreForPulseRef.current = laggedScore;
  }, [laggedScore]);

  useEffect(() => {
    if (!stats) return;
    const boost: Record<string, boolean> = {};
    for (const [k, row] of Object.entries(stats.intent)) {
      const d = row.confidence.displayValue;
      const p = prevIntentDisplayRef.current[k];
      if (p !== undefined && d > p + 0.0001) boost[k] = true;
      prevIntentDisplayRef.current[k] = d;
    }
    if (Object.keys(boost).length > 0) {
      setIntentRingPulseByKey(boost);
      const t = window.setTimeout(() => setIntentRingPulseByKey({}), 280);
      return () => window.clearTimeout(t);
    }
  }, [stats]);

  function dismissOnboarding() {
    try {
      localStorage.setItem(ONBOARDING_KEY, "1");
    } catch {
      /* ignore */
    }
    setShowOnboarding(false);
  }

  if (fetchErr) {
    return (
      <section
        style={{
          marginBottom: "2rem",
          padding: "1.25rem",
          borderRadius: 8,
          border: "1px solid rgba(248,113,113,0.35)",
          background: "rgba(248,113,113,0.06)",
          fontSize: "0.85rem",
        }}
      >
        <strong>Learning status</strong> — could not load ({fetchErr}). Run the API on port 3040 with the client
        dev proxy, or ignore if you are not using the learning dashboard.
      </section>
    );
  }

  if (!stats) {
    return (
      <section style={{ marginBottom: "2rem", fontSize: "0.85rem", color: "rgba(232,232,234,0.45)" }}>
        Loading learning system…
      </section>
    );
  }

  const narrative = systemNarrative(stats);
  const intentEntries = Object.entries(stats.intent).sort(([a], [b]) => a.localeCompare(b));
  const focusIntentKey = pickFocusIntentKey(stats);

  const targetScore = aiVisibilityScore(stats);
  const scoreForDisplay = laggedScore ?? targetScore;
  const visDeltaStr = formatVisibilityScoreDelta(displayedDelta);
  const visDeltaNum = displayedDelta ?? 0;
  const visArrow =
    displayedDelta == null || !Number.isFinite(visDeltaNum)
      ? null
      : visDeltaNum > 0
        ? "↑"
        : visDeltaNum < 0
          ? "↓"
          : "→";

  const headlineRingFill = scoreForDisplay / 100;
  const scoreMeaning = visibilityScoreMeaningLine(displayedDelta);
  const scoreMeaningColor =
    scoreMeaning.tone === "up"
      ? "#4ade80"
      : scoreMeaning.tone === "down"
        ? "#f87171"
        : scoreMeaning.tone === "flat"
          ? "rgba(232,232,234,0.55)"
          : "rgba(232,232,234,0.65)";

  return (
    <section style={{ marginBottom: "2.5rem" }}>
      <h2
        style={{
          margin: "0 0 1rem",
          fontSize: "1rem",
          fontWeight: 600,
          letterSpacing: "-0.02em",
        }}
      >
        AI learning system
      </h2>

      {showOnboarding ? (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.85rem 1rem",
            borderRadius: 8,
            border: "1px solid rgba(94, 234, 212, 0.25)",
            background: "rgba(13, 148, 136, 0.08)",
            fontSize: "0.88rem",
            lineHeight: 1.5,
            color: "rgba(232,232,234,0.88)",
            display: "flex",
            gap: "0.75rem",
            alignItems: "flex-start",
            justifyContent: "space-between",
          }}
        >
          <span>
            This system continuously improves your AI visibility by learning what works and adapting in real time.
          </span>
          <button
            type="button"
            onClick={dismissOnboarding}
            style={{
              flexShrink: 0,
              border: "none",
              background: "rgba(255,255,255,0.08)",
              color: "#e8e8ea",
              borderRadius: 6,
              padding: "0.35rem 0.65rem",
              fontSize: "0.72rem",
              cursor: "pointer",
            }}
          >
            Got it
          </button>
        </div>
      ) : null}

      <div
        style={{
          padding: "1.25rem 1.35rem",
          borderRadius: 10,
          border: "1px solid rgba(20,184,166,0.35)",
          background: "linear-gradient(135deg, rgba(13,148,136,0.12) 0%, rgba(255,255,255,0.03) 100%)",
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.1em", color: "rgba(232,232,234,0.45)" }}>
          System status
        </div>
        <div
          style={{
            marginTop: 8,
            fontSize: "1.15rem",
            fontWeight: 600,
            color: phaseStateColor(stats.system.state),
          }}
        >
          {stats.system.state}
        </div>
        <div style={{ marginTop: 6, fontSize: "0.95rem", color: "rgba(232,232,234,0.85)" }}>
          Coverage: {Math.round(stats.system.coverage * 100)}%
        </div>

        <div
          style={{
            marginTop: "1rem",
            paddingTop: "1rem",
            borderTop: "1px solid rgba(255,255,255,0.08)",
            display: "flex",
            alignItems: "flex-start",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <div title={`AI visibility score ${scoreForDisplay} out of 100`}>
            <ConfidenceRing
              fill={headlineRingFill}
              size={64}
              stroke={5}
              color="#5eead4"
              label={String(scoreForDisplay)}
              labelStyle={{ fontSize: "1.1rem" }}
              emphasize={scoreRingPulse}
            />
            <div
              style={{
                width: 64,
                height: 3,
                marginTop: 10,
                borderRadius: 2,
                background: "rgba(255,255,255,0.08)",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${headlineRingFill * 100}%`,
                  borderRadius: 2,
                  background: "linear-gradient(90deg, #0d9488, #5eead4)",
                  transition: "width 0.4s ease",
                }}
              />
            </div>
          </div>
          <div style={{ flex: "1 1 180px", minWidth: 0 }}>
            <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(232,232,234,0.45)" }}>
              AI visibility score
            </div>
            <div
              style={{
                marginTop: 4,
                fontSize: "1.05rem",
                fontWeight: 600,
                color: "rgba(232,232,234,0.92)",
              }}
            >
              <span style={{ fontWeight: 500, color: "rgba(232,232,234,0.45)" }}>out of 100</span>
              {visDeltaStr != null && visArrow ? (
                <>
                  <span
                    key={`${visDeltaStr}-${scoreForDisplay}`}
                    className="lm-trend-chip"
                    style={{
                      marginLeft: 10,
                      color: trendDeltaColor(visDeltaNum),
                      fontWeight: 600,
                    }}
                  >
                    {visArrow} {visDeltaStr}
                  </span>
                  <span
                    style={{
                      marginLeft: 8,
                      fontSize: "0.82rem",
                      fontWeight: 500,
                      color: "rgba(232,232,234,0.42)",
                    }}
                  >
                    since last update
                  </span>
                </>
              ) : null}
            </div>
            <p
              style={{
                margin: "0.65rem 0 0",
                fontSize: "0.9rem",
                lineHeight: 1.45,
                color: scoreMeaningColor,
                fontWeight: 500,
              }}
            >
              {scoreMeaning.text}
            </p>
            <p style={{ margin: "0.35rem 0 0", fontSize: "0.72rem", color: "rgba(232,232,234,0.38)", lineHeight: 1.4 }}>
              {pollWindowHintSeconds(POLL_MS)}
            </p>
          </div>
        </div>

        <p
          style={{
            margin: "0.85rem 0 0",
            fontSize: "0.92rem",
            lineHeight: 1.5,
            color: "rgba(232,232,234,0.78)",
          }}
        >
          → {narrative}
        </p>
        <p
          style={{
            margin: "0.5rem 0 0",
            fontSize: "0.88rem",
            lineHeight: 1.5,
            color: "rgba(94, 234, 212, 0.75)",
          }}
        >
          → System continuously adapts to improve your AI visibility
        </p>
        <div style={{ marginTop: "0.85rem", fontSize: "0.78rem", color: "rgba(232,232,234,0.4)" }}>
          Strategy: {stats.strategy.replace(/_/g, " ")} · k={stats.kEffective} · API v{stats.version}
        </div>
      </div>

      <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(232,232,234,0.45)", marginBottom: 8 }}>
        Intent maturity
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "0.85rem",
        }}
      >
        {intentEntries.length === 0 ? (
          <p style={{ ...cardStyle, margin: 0, color: "rgba(232,232,234,0.45)", fontSize: "0.88rem" }}>
            No intent-level stats yet — run audits so pattern memory fills in.
          </p>
        ) : null}
        {intentEntries.map(([key, row]) => {
          const c = row.confidence;
          const trend = c.trend;
          const delta = trend != null ? parseFloat(String(trend).replace(/^\+/, "")) : NaN;
          const arrow =
            trend == null || !Number.isFinite(delta) ? null : delta > 0 ? "↑" : delta < 0 ? "↓" : "→";
          const trendCol = !Number.isFinite(delta) ? "rgba(232,232,234,0.45)" : trendDeltaColor(delta);
          const uLab = uncertaintyLabel(c.uncertainty);
          const mom = momentumDisplayLabel(trend);
          const momKind = momentumFromTrend(trend);
          const confCol = confidenceLabelColor(c.label);
          const stateCol = phaseStateColor(c.state);
          const isFocus = focusIntentKey != null && key === focusIntentKey;

          return (
            <div
              key={key}
              className={isFocus ? "lm-intent-focus" : undefined}
              style={{
                ...cardStyle,
                transition: "transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 10 }}>
                <div title={`Confidence strength: ${Math.round(c.displayValue * 100)}% (normalized)`}>
                  <ConfidenceRing
                    fill={c.displayValue}
                    size={52}
                    stroke={4}
                    color={confCol}
                    emphasize={!!intentRingPulseByKey[key]}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 600, fontSize: "1rem", textTransform: "capitalize" }}>
                      {key.replace(/_/g, " ")}
                    </span>
                    {isFocus ? (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          padding: "2px 6px",
                          borderRadius: 4,
                          background: "rgba(45, 212, 191, 0.2)",
                          color: "#5eead4",
                        }}
                      >
                        Focus
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div style={{ fontSize: "0.88rem", lineHeight: 1.55, color: "rgba(232,232,234,0.8)" }}>
                <div>
                  <span title={TOOLTIP_CONFIDENCE} style={helpCursor}>
                    Confidence
                  </span>
                  :{" "}
                  <span style={{ color: confCol, fontWeight: 600 }}>
                    {formatConfidenceLabel(c.label)} ({c.displayValue})
                  </span>
                  {trend && arrow ? (
                    <>
                      <span
                        key={`${key}-${trend}`}
                        className="lm-trend-chip"
                        style={{ color: trendCol, marginLeft: 6, fontWeight: 600 }}
                      >
                        {arrow} {trend}
                      </span>
                      <span style={{ marginLeft: 6, fontSize: "0.78rem", color: "rgba(232,232,234,0.4)", fontWeight: 500 }}>
                        since last update
                      </span>
                    </>
                  ) : null}
                </div>
                <div style={{ marginTop: 4 }}>
                  State:{" "}
                  <span style={{ color: stateCol, fontWeight: 600 }}>{c.state}</span>
                </div>
                <div style={{ marginTop: 4 }}>
                  Momentum:{" "}
                  <strong style={{ fontWeight: 600, color: momentumKindColor(momKind) }}>{mom}</strong>
                </div>
                <div style={{ marginTop: 8, color: "rgba(232,232,234,0.55)" }}>
                  <span title={TOOLTIP_UNCERTAINTY} style={helpCursor}>
                    Uncertainty
                  </span>
                  : {uLab.replace(/ uncertainty$/i, "")}
                </div>
                <div style={{ marginTop: 8, fontSize: "0.82rem", color: "rgba(232,232,234,0.5)" }}>
                  Data points: {row.samples} · Coverage patterns: {row.patterns}
                </div>
                <div
                  style={{
                    marginTop: 10,
                    fontSize: "0.84rem",
                    color:
                      trend == null || !Number.isFinite(delta)
                        ? "rgba(232,232,234,0.5)"
                        : trendDeltaColor(delta),
                  }}
                >
                  {visibilityOutcomeLine(trend)}
                </div>
                {isFocus ? (
                  <p
                    style={{
                      margin: "0.55rem 0 0",
                      fontSize: "0.78rem",
                      lineHeight: 1.4,
                      color: "rgba(45, 212, 191, 0.85)",
                      fontStyle: "italic",
                    }}
                  >
                    {FOCUS_INTENT_REASONING}
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      {(stats.weakest.attempts > 0 || stats.rotation.attempts > 0) && (
        <div style={{ marginTop: "1.5rem" }}>
          <div style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(232,232,234,0.45)", marginBottom: 8 }}>
            System performance
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <div style={cardStyle}>
              <div style={{ fontSize: "0.75rem", color: "rgba(232,232,234,0.5)" }}>Targeted explore (weakest)</div>
              <div style={{ marginTop: 6, fontSize: "0.9rem" }}>
                {Math.round(stats.weakest.hitRate * 100)}% success
                {stats.weakest.avgLift != null
                  ? ` · ${stats.weakest.avgLift >= 0 ? "+" : ""}${stats.weakest.avgLift} lift`
                  : ""}
              </div>
              <div style={{ fontSize: "0.75rem", color: "rgba(232,232,234,0.4)", marginTop: 4 }}>{stats.weakest.attempts} rolls</div>
            </div>
            <div style={cardStyle}>
              <div style={{ fontSize: "0.75rem", color: "rgba(232,232,234,0.5)" }}>Rotation</div>
              <div style={{ marginTop: 6, fontSize: "0.9rem" }}>
                {Math.round(stats.rotation.hitRate * 100)}% success
                {stats.rotation.avgLift != null
                  ? ` · ${stats.rotation.avgLift >= 0 ? "+" : ""}${stats.rotation.avgLift} lift`
                  : ""}
              </div>
              <div style={{ fontSize: "0.75rem", color: "rgba(232,232,234,0.4)", marginTop: 4 }}>{stats.rotation.attempts} rolls</div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

const cardStyle: CSSProperties = {
  padding: "1rem 1.1rem",
  borderRadius: 8,
  border: "1px solid rgba(255,255,255,0.08)",
  background: "rgba(255,255,255,0.03)",
};
