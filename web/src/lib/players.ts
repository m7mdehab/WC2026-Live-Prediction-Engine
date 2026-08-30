// Pure player-display helpers, shared by the /players index island (client) and the server profile
// pages. NO server-only marker and NO data-layer import - this is presentation logic only (labels,
// role-metric selection, formatting), so it is safe in both client and server components. Mirrors
// teamSlug.ts (a pure helper imported from both sides).

import type { PlayerMatchStat, PlayerProjection } from "@/lib/types/players";

/** Human label for a role code (GK | DF | MF | FW). Falls back to the raw code. */
export function roleLabel(role: string | null): string {
  switch (role) {
    case "GK": return "Goalkeeper";
    case "DF": return "Defender";
    case "MF": return "Midfielder";
    case "FW": return "Forward";
    default: return role ?? "—";
  }
}

/** Tag variant per role, so each role reads with a consistent accent across the feature. */
export function roleTagVariant(role: string | null): "confident" | "up" | "upset" | "neutral" {
  switch (role) {
    case "GK": return "upset";
    case "DF": return "confident";
    case "MF": return "up";
    case "FW": return "neutral";
    default: return "neutral";
  }
}

/** The short column abbreviations + their one-line legend expansions for the per-role index columns
 *  (Wave A). These are the ONLY copy the index card carries: a single small-font legend line per tab,
 *  the sanctioned exception to the no-prose rule. Keyed by the stable column id the table renders. */
export const COLUMN_LABEL: Record<string, { abbr: string; legend: string }> = {
  // attacking columns (All / FW / MF)
  actualGoals: { abbr: "AG", legend: "AG actual goals" },
  actualAssists: { abbr: "AA", legend: "AA actual assists" },
  expectedGoals: { abbr: "XG", legend: "XG expected goals" },
  expectedAssists: { abbr: "XA", legend: "XA expected assists" },
  // keeper columns (GK)
  actualCleanSheets: { abbr: "CS", legend: "CS actual clean sheets" },
  actualGoalsConceded: { abbr: "GC", legend: "GC actual goals conceded" },
  actualSaves: { abbr: "Saves", legend: "Saves actual saves" },
  expectedGoalsPrevented: { abbr: "GP", legend: "GP expected goals prevented" },
  // defensive value projection (GK/DF)
  expectedCleanSheets: { abbr: "xCS", legend: "xCS expected clean sheets" },
};

/** Short human label for a projection metric name. */
export function metricLabel(metric: string): string {
  switch (metric) {
    case "expected_goals": return "Goals";
    case "expected_assists": return "Assists";
    case "expected_shots": return "Shots";
    case "expected_key_passes": return "Key passes";
    case "expected_clean_sheets": return "Clean sheets";
    case "expected_goals_prevented": return "Goals prevented";
    default: return metric.replace(/^expected_/, "").replace(/_/g, " ");
  }
}

/** Sub-role prettifier ("center_forward" -> "Center forward"). */
export function subRoleLabel(subRole: string | null): string | null {
  if (!subRole) return null;
  const s = subRole.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Format a metric value: tabular, sensible precision (counts vs fractional). null -> "-". */
export function fmtMetric(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  // goals-prevented can be negative; clean sheets/goals are usually fractional projections.
  if (Number.isInteger(v)) return String(v);
  return v.toFixed(1);
}

/** The stated ceiling of a 0-100 role rating / index. A DISPLAY-only guarantee: no figure on a 0-100
 *  axis can render above its own scale, even if the underlying artifact value overshoots (e.g. a GK
 *  position rating computed >100 before the percentile-within-role artifact lands). Rank ORDERING is
 *  unaffected - the clamp is applied at render, never to the sort - so the board stays correctly ordered;
 *  the number is simply pinned to the top of its scale rather than contradicting it. Belt-and-brace:
 *  once the percentile artifact ships, values are natively 0-100 and this is a no-op. */
export const RATING_CEILING = 100;
export function fmtRating(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return fmtMetric(Math.max(0, Math.min(RATING_CEILING, v)));
}

/** The per-match-stats column that accrues against a given expected_* metric (running actual). */
export function actualKeyForMetric(metric: string): keyof PlayerMatchStat | null {
  switch (metric) {
    case "expected_goals": return "goals";
    case "expected_assists": return "assists";
    case "expected_shots": return "shots";
    case "expected_key_passes": return "keyPasses";
    case "expected_clean_sheets": return "cleanSheet";
    case "expected_goals_prevented": return "saves"; // best available proxy in the match log
    default: return null;
  }
}

/** Sum the running actual for a metric across the match log (clean_sheet counts true rows). */
export function accruedActual(metric: string, log: PlayerMatchStat[]): number | null {
  const key = actualKeyForMetric(metric);
  if (!key) return null;
  let total = 0;
  let any = false;
  for (const s of log) {
    const raw = s[key];
    if (key === "cleanSheet") { if (raw === true) total += 1; any = true; }
    else if (typeof raw === "number") { total += raw; any = true; }
  }
  return any ? total : null;
}

/** The ordered metric set a role's EXPECTED-vs-ACTUAL block should surface, so GK/DF/MF/FW layouts
 *  differ. Driven by role, then intersected with the metrics actually present (so we never show an
 *  empty row the data can't back). The first entry is the role headline. */
export function roleMetricOrder(role: string | null): string[] {
  switch (role) {
    case "GK": return ["expected_clean_sheets", "expected_goals_prevented"];
    case "DF": return ["expected_clean_sheets", "expected_key_passes", "expected_goals", "expected_assists"];
    case "MF": return ["expected_assists", "expected_key_passes", "expected_goals", "expected_shots"];
    case "FW": return ["expected_goals", "expected_assists", "expected_shots", "expected_key_passes"];
    default: return ["expected_goals", "expected_assists", "expected_key_passes", "expected_shots", "expected_clean_sheets", "expected_goals_prevented"];
  }
}

/** Resolve the role-ordered metrics that this player actually has a projection for. */
export function presentRoleMetrics(role: string | null, projections: PlayerProjection[]): string[] {
  const have = new Set(projections.filter((p) => p.expectedValue != null).map((p) => p.metric));
  return roleMetricOrder(role).filter((m) => have.has(m));
}

/** The faint podium BORDER class for a 1-based golden-boot rank: gold (1), silver (2), bronze (3),
 *  and the plain card border for rank 4+ (no medal). Token-driven (border-medal-*-border), low-alpha,
 *  so the ring reads as a subtle frame in every theme, never a loud outline. Shared by the home Golden
 *  Boot race card and the /players Golden Boot award card so the two surfaces frame the top three
 *  IDENTICALLY. Rank is 1-based; any rank >= 4 (or <= 0) gets the neutral border. */
export function medalBorderClass(rank: number): string {
  switch (rank) {
    case 1: return "border-medal-gold-border";
    case 2: return "border-medal-silver-border";
    case 3: return "border-medal-bronze-border";
    default: return "border-border";
  }
}

/** "M001" -> "Match 1" for the per-match log. Falls back to the raw id. */
export function matchLabel(matchId: string): string {
  const m = /^M0*(\d+)$/i.exec(matchId);
  return m ? `Match ${Number(m[1])}` : matchId;
}

/** Provenance label for a match-stat source string ("auto:fotmob" -> "Auto · FotMob"). */
export function sourceLabel(source: string): string {
  if (!source) return "—";
  const [mode, prov] = source.split(":");
  const modeLabel = mode === "auto" ? "Auto" : mode === "manual" ? "Manual" : mode;
  const provLabel = prov ? prov.replace(/\b\w/g, (c) => c.toUpperCase()) : null;
  return provLabel ? `${modeLabel} · ${provLabel}` : modeLabel;
}
