import { ImageResponse } from "next/og";

// hex-guard-ok-file: next/og (Satori) renders the OG image without CSS variables, so literal hex is required here.

// Dynamic 1200x630 social card, generated at build time. On-brand: dark navy ground + metallic-gold
// accents (the site's gold family), the "Presaira" wordmark, a one-line value prop, and the domain.
// Satori rule: every element with >1 child sets display:flex, or the build fails.
export const alt = "Presaira: World Cup 2026 Live Prediction Engine. Make your bracket and beat the AI.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          height: "100%",
          background: "#0a0f1e",
          color: "#f8fafc",
          padding: "76px 84px",
          fontFamily: "sans-serif",
        }}
      >
        {/* metallic gold top stripe (mirrors the site hero) */}
        <div
          style={{
            display: "flex",
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 12,
            background:
              "linear-gradient(90deg, #a16207, #eab308, #fcd34d, #eab308, #a16207)",
          }}
        />

        {/* wordmark - div-drawn gold diamond (no glyph font fetch) + Presaira */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              width: 34,
              height: 34,
              borderRadius: 9,
              transform: "rotate(45deg)",
              background: "linear-gradient(135deg, #fcd34d, #eab308, #a16207)",
            }}
          />
          <div style={{ display: "flex", fontSize: 48, fontWeight: 700, letterSpacing: -1 }}>
            Presaira
          </div>
        </div>

        {/* headline + value prop */}
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div
            style={{
              display: "flex",
              fontSize: 78,
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: -2,
              maxWidth: 1000,
            }}
          >
            World Cup 2026 Live Prediction Engine
          </div>
          <div style={{ display: "flex", fontSize: 34, color: "#cbd5e1", maxWidth: 980 }}>
            Calibrated, probabilistic AI forecasts for every match and the tournament.
          </div>
          {/* gold CTA pill: the conversion hook (no arrow glyph; Satori would tofu it) */}
          <div style={{ display: "flex", marginTop: 8 }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                background: "linear-gradient(135deg, #fcd34d, #eab308, #a16207)",
                color: "#0a0f1e",
                fontSize: 32,
                fontWeight: 700,
                padding: "16px 36px",
                borderRadius: 999,
              }}
            >
              Make your bracket. Beat the AI.
            </div>
          </div>
        </div>

        {/* footer: domain + disclaimer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", fontSize: 32, fontWeight: 600, color: "#fbbf24" }}>
            presaira.com
          </div>
          <div style={{ display: "flex", fontSize: 24, color: "#64748b" }}>
            Independent · not affiliated with FIFA
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
