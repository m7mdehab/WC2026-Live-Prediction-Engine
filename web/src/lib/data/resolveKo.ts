// Resolved-knockout overlay rule, shared so the /matches list and the match-detail page agree by
// construction. A knockout fixture keeps team_a/team_b NULL in the fixtures table until its feeder is
// decided; the projected_bracket carries the resolved participant PER SIDE (team_a/team_b with the
// a_resolved/b_resolved flags). lib/data/daily.ts applies this same per-side rule to the /matches list,
// and lib/data.getMatchDetail applies it (via this helper) to the match-detail loader, so a resolved
// knockout match renders the real fixture instead of the "Match not set yet" placeholder.

/** A projected_bracket row's resolved-knockout participants, per side. */
export type BracketResolvedRow = {
  team_a: string | null;
  team_b: string | null;
  a_resolved: boolean;
  b_resolved: boolean;
};

/** Overlay the resolved knockout sides from a projected_bracket `row` onto a `fixture`, in place. A side
 *  is filled ONLY when the bracket marks it resolved AND carries a concrete team AND the fixture side is
 *  still empty; an undecided side keeps its null, so the detail page still shows the placeholder for a
 *  genuinely unresolved slot. Group fixtures and a missing row are returned unchanged. Returns the same
 *  fixture object (mutated) for chaining. */
export function overlayResolvedKo<
  T extends { stage: string; team_a: string | null; team_b: string | null },
>(fixture: T, row: BracketResolvedRow | null): T {
  if (!row || fixture.stage === "group") return fixture;
  if (!fixture.team_a && row.a_resolved && row.team_a) fixture.team_a = row.team_a;
  if (!fixture.team_b && row.b_resolved && row.team_b) fixture.team_b = row.team_b;
  return fixture;
}
