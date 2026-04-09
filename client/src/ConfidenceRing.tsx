import type { CSSProperties } from "react";

type Props = {
  /** 0–1 fill amount (e.g. displayValue or score/100). */
  fill: number;
  /** Pixel width/height of the SVG. */
  size?: number;
  /** Base stroke width in px. */
  stroke?: number;
  /** Progress arc color. */
  color: string;
  /** Optional label centered in the ring (e.g. "63"). */
  label?: string;
  labelStyle?: CSSProperties;
  /** Short pulse: thicker, brighter arc (confidence / score increased). */
  emphasize?: boolean;
};

export function ConfidenceRing({
  fill,
  size = 56,
  stroke = 4,
  color,
  label,
  labelStyle,
  emphasize = false,
}: Props) {
  const p = Math.max(0, Math.min(1, Number.isFinite(fill) ? fill : 0));
  const activeStroke = emphasize ? stroke + 2 : stroke;
  const r = (size - activeStroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const dash = circumference * p;

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ transform: "rotate(-90deg)" }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={activeStroke} />
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={activeStroke}
          strokeDasharray={`${dash} ${circumference}`}
          strokeLinecap="round"
          style={{
            transition:
              "stroke-dasharray 0.35s ease, stroke-width 0.28s ease, filter 0.28s ease, opacity 0.28s ease",
            filter: emphasize ? "brightness(1.22)" : "none",
            opacity: emphasize ? 1 : 0.95,
          }}
        />
      </svg>
      {label ? (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: size * 0.26,
            fontWeight: 700,
            color: "#e8e8ea",
            pointerEvents: "none",
            transition: "transform 0.28s ease",
            transform: emphasize ? "scale(1.03)" : "scale(1)",
            ...labelStyle,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
}
