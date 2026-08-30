// Pure pace-band metric builder, shared by the /players/[id] server page (computes the props) and
// the PaceBand client island (types). NO server-only import - presentation-safe on both sides,
// mirroring lib/players.ts.

import { accruedActual } from "@/lib/players";
import type { PlayerProfile } from "@/lib/types/players";

/** One toggleable pace metric: the FULL-TOURNAMENT projection (value + band) against the player's
 *  to-date actual total summed from the match log. Only built when the projection exists.
 *
 *  PROVENANCE: `expected` is the player's committed pre-tournament full-tournament projection
 *  (player_projections.expected_value for this metric, the frozen model line the profile already
 *  reads); `actual` is the to-date sum from the logged match actuals. The PaceBand labels the
 *  projection as "full-tournament" so the ahead/behind read is never mistaken for a per-match pace. */
export interface PaceMetric {
  /** Stable key + tab label ("G" goals, "A" assists, "CS" clean sheets fallback). */
  key: string;
  /** Full-tournament projected value (expected_value of the metric's projection row). */
  expected: number;
  /** ~1-sigma projection band; null bounds when the model published none (band fill is skipped). */
  bandLow: number | null;
  bandHigh: number | null;
  /** To-date actual total, summed across the logged matches (0 when nothing logged yet). */
  actual: number;
}

// The [G|A] toggle pair, in tab order.
const GOAL_ASSIST: { metric: string; key: string }[] = [
  { metric: "expected_goals", key: "G" },
  { metric: "expected_assists", key: "A" },
];

/** The pace metrics a profile's band can honestly show: goals and/or assists when projected; for a
 *  GK/DF with neither, the role headline (expected_clean_sheets) as a single band. Empty when the
 *  data supports nothing (actuals-only player) - the caller renders NOTHING then. */
export function buildPaceMetrics(profile: PlayerProfile): PaceMetric[] {
  const byMetric = new Map(profile.projections.map((p) => [p.metric, p]));

  const make = (metric: string, key: string): PaceMetric | null => {
    const p = byMetric.get(metric);
    if (!p || p.expectedValue == null) return null;
    return {
      key,
      expected: p.expectedValue,
      bandLow: p.bandLow,
      bandHigh: p.bandHigh,
      actual: accruedActual(metric, profile.matchStats) ?? 0,
    };
  };

  const ga = GOAL_ASSIST
    .map(({ metric, key }) => make(metric, key))
    .filter((m): m is PaceMetric => m !== null);
  if (ga.length > 0) return ga;

  // GK/DF without a goals/assists split: fall back to the role headline metric (clean sheets).
  if (profile.player.role === "GK" || profile.player.role === "DF") {
    const cs = make("expected_clean_sheets", "CS");
    if (cs) return [cs];
  }
  return [];
}
