// RELEVANCE selection for the title-odds-over-time chart. Pure + deterministic (no server-only, no
// Date, no Math.random) so both the client chart AND the node unit tests can import it.
//
// THE BUG THIS REPLACES: the chart used to plot the alphabetically-ordered top-N by CURRENT champion
// odds. Late in the tournament the still-alive set is tiny, so the remaining slots were filled by
// eliminated teams sitting flat at ~0%, and ties broke alphabetically (Algeria, ...). The dramatic
// lines the view exists to show, former contenders FALLING from a peak toward 0% as they are knocked
// out, were dropped entirely.
//
// THE RULE: the default set is chosen by RELEVANCE, the union of
//   - the still-ALIVE teams (current champion at/above aliveFloor), highest current odds first, and
//   - the MOST-FALLEN teams (largest peak-to-now drop), so the falling-to-zero lines always render.
// Faller slots are RESERVED so a shrinking alive set can never crowd the drama out. An irrelevant
// team (flat near 0 the whole time, never a real contender) has no current odds and no drop, so it is
// never selected, alphabetical order never decides membership.

/** A team + its current (latest-step) champion probability, ready for the chart to plot. */
export interface OverTimePick {
  team: string;
  champion: number;
}

/** The minimal shape the selection needs from a title-odds series (structurally a TitleOddsSeries). */
interface SeriesLike {
  team: string;
  points: { champion: number }[];
}

export interface SelectOpts {
  /** Max lines to plot (default 6). */
  limit?: number;
  /** Current champion at/above this counts as "still alive / in contention" (default 0.01 = 1%). */
  aliveFloor?: number;
  /** A peak-to-now drop at/above this counts as a real faller worth showing (default 0.02 = 2pp). */
  minDrop?: number;
  /** Slots reserved for the biggest fallers so falling-to-zero lines are never crowded out (default 2). */
  reserveFallen?: number;
}

/** Select which teams the title-odds chart plots, by RELEVANCE (alive set + biggest fallers), never
 *  alphabetically. Falls back to the provided current-standings list only when there is no usable
 *  multi-step history (the pre-tournament baseline state). Deterministic; ties break by current odds
 *  then team name so the output is stable across renders. */
export function selectOverTimeContenders(
  series: SeriesLike[],
  fallback: OverTimePick[],
  opts: SelectOpts = {},
): OverTimePick[] {
  const limit = opts.limit ?? 6;
  const aliveFloor = opts.aliveFloor ?? 0.01;
  const minDrop = opts.minDrop ?? 0.02;
  const reserveFallen = opts.reserveFallen ?? 2;

  // A team is a candidate only if it has a real (>= 2 step) trajectory to draw.
  const rows = series
    .filter((s) => Array.isArray(s.points) && s.points.length >= 2)
    .map((s) => {
      const vals = s.points.map((p) => p.champion ?? 0);
      const champion = vals[vals.length - 1] ?? 0;
      const peak = Math.max(...vals);
      return { team: s.team, champion, drop: peak - champion };
    });

  // No usable history -> the pre-tournament baseline: show the current standings as handed in.
  if (rows.length === 0) return fallback.slice(0, limit);

  const byOdds = (a: { champion: number; team: string }, b: { champion: number; team: string }) =>
    b.champion - a.champion || a.team.localeCompare(b.team);

  // still alive (real current odds), best odds first.
  const alive = rows.filter((r) => r.champion >= aliveFloor).sort(byOdds);
  // fallers with a meaningful peak-to-now collapse, biggest drop first (these are the eliminations).
  const fallers = rows
    .filter((r) => r.drop >= minDrop)
    .sort((a, b) => b.drop - a.drop || a.team.localeCompare(b.team));

  // reserve room for the biggest fallers so the falling-to-zero lines always make the cut.
  const fallenSlots = Math.min(fallers.length, reserveFallen, limit);
  const aliveSlots = Math.max(0, limit - fallenSlots);

  const picked = new Map<string, OverTimePick>();
  const add = (r: { team: string; champion: number }) => {
    if (picked.size >= limit || picked.has(r.team)) return;
    picked.set(r.team, { team: r.team, champion: r.champion });
  };

  // 1) the best still-alive teams (up to their budget), 2) the biggest fallers (guaranteed slots),
  // 3) backfill any spare capacity with the remaining RELEVANT teams (alive, then fallers) only.
  // A team that is neither alive nor a real faller (flat near 0 all tournament) is never added, even
  // when slots remain: showing fewer honest lines beats padding the view with an irrelevant flat line
  // (this is exactly what surfaced the alphabetically-first team before).
  for (const r of alive.slice(0, aliveSlots)) add(r);
  for (const r of fallers) add(r);
  for (const r of alive) add(r);
  for (const r of fallers) add(r);

  // Display order: current odds desc, so the favourite is first (the leader accent) and the
  // eliminated, fallen-to-zero lines settle to the bottom.
  return [...picked.values()].sort(byOdds);
}
