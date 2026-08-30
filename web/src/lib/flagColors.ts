// Flag-dominant-colour module. One source of truth for "what colour is this nation" across the
// home surfaces (title-odds chart lines/legend, champion confetti). Pure data, deterministic:
// no Math.random, no Date, safe for SSR. Keys match the canonical team names in lib/flags.ts
// (all 48 WC2026 teams plus Wales / Northern Ireland).
//
// Colours are chosen to be RECOGNIZABLE for the nation AND legible on a dark background. Very light
// or white-dominant flags (England, Argentina, Japan, ...) use their legible accent colour rather
// than white, and expose flagRing() so a small flag chip can be given a subtle outline.

/** Recognizable, dark-background-legible dominant colour per nation (hex). */
const TEAM_COLOR: Record<string, string> = {
  // --- top contenders kept visually distinct (these co-appear in the chart top 5) ---
  Argentina: "#75AADB", // sky blue
  Spain: "#C60B1E", // red
  Brazil: "#009C3B", // green
  France: "#0055A4", // blue
  England: "#E4002B", // red accent (white flag)
  Germany: "#FCD116", // gold (distinct from the reds)
  Netherlands: "#F36C21", // orange
  Portugal: "#DA291C", // red

  // --- remainder of the 48, sensible flag-dominant colours ---
  Mexico: "#006847", // green
  "South Africa": "#007A4D", // green
  "South Korea": "#CD2E3A", // red
  "Czech Republic": "#11457E", // blue
  Canada: "#D52B1E", // red
  "Bosnia and Herzegovina": "#FFD100", // yellow
  Qatar: "#8A1538", // maroon
  Switzerland: "#E2001A", // red
  Morocco: "#C1272D", // red
  Haiti: "#1A3FBF", // blue
  Scotland: "#005EB8", // saltire blue
  "United States": "#3C5CCF", // blue
  Paraguay: "#D52B1E", // red
  Australia: "#1C44B2", // blue
  Turkey: "#E30A17", // red
  "Curaçao": "#1F4FB5", // blue
  "Ivory Coast": "#FF8200", // orange
  Ecuador: "#FFD100", // yellow
  Japan: "#BC002D", // crimson
  Sweden: "#FECB00", // yellow
  Tunisia: "#E70013", // red
  Belgium: "#FDDA24", // yellow
  Egypt: "#CE1126", // red
  Iran: "#239F40", // green
  "New Zealand": "#1C44B2", // blue
  "Cape Verde": "#1F4FB5", // blue
  "Saudi Arabia": "#006C35", // green
  Uruguay: "#3A6FC4", // blue
  Senegal: "#00853F", // green
  Iraq: "#CE1126", // red
  Norway: "#BA0C2F", // red
  Algeria: "#006233", // green
  Austria: "#ED2939", // red
  Jordan: "#007A3D", // green
  "DR Congo": "#3FA0FF", // sky blue
  Uzbekistan: "#0099B5", // blue
  Colombia: "#FCD116", // yellow
  Croatia: "#E4141B", // red
  Ghana: "#006B3F", // green
  Panama: "#1A5FA8", // blue
  // supported beyond the 48 (mirrors lib/flags.ts)
  Wales: "#C8102E", // red
  "Northern Ireland": "#C8102E", // red
};

/** Neutral fallback for any unmapped team (keeps everything legible, never throws). */
export const FLAG_COLOR_FALLBACK = "#9CA3AF";

/** Very light / white-dominant flags: their chips want a subtle ring to read on light surfaces. */
const LIGHT_FLAGS = new Set<string>([
  "England", "Argentina", "Japan", "South Korea", "Canada", "Uruguay",
]);

/** The recognizable dominant flag colour for a team (hex). Falls back to a neutral grey. */
export function flagColor(team: string): string {
  return TEAM_COLOR[team] ?? FLAG_COLOR_FALLBACK;
}

/** Clamp + parse helpers for deterministic hex math (no rounding surprises across runs). */
function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Lighten (pct > 0) or darken (pct < 0) a hex colour by a fraction toward white / black. */
function shadeHex(hex: string, pct: number): string {
  const [r, g, b] = parseHex(hex);
  if (pct >= 0) {
    return toHex(r + (255 - r) * pct, g + (255 - g) * pct, b + (255 - b) * pct);
  }
  const k = 1 + pct; // pct negative -> k in [0,1)
  return toHex(r * k, g * k, b * k);
}

/** A small 3-5 shade set derived from the team's dominant colour, for confetti richness.
 *  Deterministic: same team always yields the same ordered set. */
export function flagConfettiShades(team: string): string[] {
  const base = flagColor(team);
  return [
    shadeHex(base, 0.35), // light tint
    base, // dominant
    shadeHex(base, -0.28), // deep shade
    "#FFFFFF", // white sparkle for richness (most flags carry white)
  ];
}

/** True when a team's flag is light/white-dominant and a chip should get a subtle outline. */
export function isLightFlag(team: string): boolean {
  return LIGHT_FLAGS.has(team);
}

/** A subtle ring/outline colour for near-white flag chips (null when no ring is needed). */
export function flagRing(team: string): string | null {
  return LIGHT_FLAGS.has(team) ? "rgba(148, 163, 184, 0.6)" : null;
}
