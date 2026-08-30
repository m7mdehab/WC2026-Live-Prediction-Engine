// Pure, client-safe fate logic for the /groups Survival Map (W5 direction A). No I/O, no React, so
// it unit-tests as a bare module (node test/survival_map_fate.mjs).
//
// Fate reuses the data layer's already-computed advanced / isThird flags: pre-tournament they reflect
// the model's projected finishing order, and once matches are played they reflect the real FIFA
// Article 13 finishing order. The same three helpers therefore colour a projected field and a live
// one with no branching, and NOTHING about qualification is invented here - through / contention /
// out is read straight off the engine's standings (top-2 advance, 3rd is best-third contention).
import type { GroupsData, GroupStatus, TeamStanding } from "@/lib/data/groups";

export type Fate = "through" | "contention" | "out";

/** A team's tournament fate from its (projected or real) group finish. advanced is checked first so a
 *  top-2 team is never miscoloured, even in the degenerate case where both flags were set.
 *
 *  Third place resolves by STATE: while the group stage is live/projected a 3rd-placed team is in
 *  best-third "contention"; once the stage is FINAL (settled), contention is decided - the team either
 *  reached the knockouts (qualifiedThird -> "through") or did not ("out"). The qualifiedThird fact is
 *  read from data.bestThirds[].qualifies (the engine's already-applied best-third chain), NOT recomputed
 *  here - no tiebreak regulation is invented. So post-tournament the map states what happened instead of
 *  reading a permanent "12 in contention". */
export function fateOf(
  t: Pick<TeamStanding, "advanced" | "isThird">,
  qualifiedThird = false,
  settled = false,
): Fate {
  if (t.advanced) return "through";
  if (t.isThird) {
    if (!settled) return "contention";
    return qualifiedThird ? "through" : "out";
  }
  return "out";
}

/** Legend / summary order (also the colour-key order): through, then contention, then out. */
export const FATE_ORDER: Fate[] = ["through", "contention", "out"];

/** Fate tally across the WHOLE field (drives the summary/legend counters). Every team is counted
 *  exactly once. Pre-settlement a full 12-group field yields 24 through / 12 contention / 12 out; once
 *  FINAL the 8 qualified thirds move to "through" and the 4 non-qualifiers to "out" (32 / 0 / 16). The
 *  qualified set + settled flag are derived from data.bestThirds + data.status, so a settled field
 *  never reads a live-tense "12 in contention". */
export function fateTally(data: Pick<GroupsData, "groups" | "bestThirds" | "status">): Record<Fate, number> {
  const settled = data.status === "final";
  const qualifiedThirds = new Set((data.bestThirds ?? []).filter((b) => b.qualifies).map((b) => b.team));
  const tally: Record<Fate, number> = { through: 0, contention: 0, out: 0 };
  for (const g of data.groups) for (const t of g.teams) tally[fateOf(t, qualifiedThirds.has(t.team), settled)] += 1;
  return tally;
}

/** Fate -> token classes (no raw hex; every hue is a design token from globals.css). */
export const FATE_FILL: Record<Fate, string> = {
  through: "border-up/40 bg-up/10",
  contention: "border-upset/40 bg-upset/10",
  out: "border-border bg-elevated",
};
export const FATE_DOT: Record<Fate, string> = {
  through: "bg-up",
  contention: "bg-upset",
  out: "bg-muted",
};
export const FATE_TEXT: Record<Fate, string> = {
  through: "text-up",
  contention: "text-upset",
  out: "text-muted",
};

/** Legend/label copy per fate. Projected flags that nothing is decided pre-tournament; once FINAL the
 *  "contention" band is empty (every 3rd place is resolved to through/out) but its label must still read
 *  as settled ("3rd-place decided") rather than the live-tense "3rd-place contention". */
export function fateLabel(f: Fate, status: GroupStatus): string {
  const projected = status === "projected";
  if (f === "through") return projected ? "Projected through" : "Through";
  if (f === "out") return projected ? "Projected out" : "Out";
  return status === "final" ? "3rd-place decided" : "3rd-place contention";
}
