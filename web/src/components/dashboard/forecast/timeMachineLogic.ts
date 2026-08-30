// Pure, deterministic logic for the Odds Time Machine (no React, no Date, no Math.random) so the
// interactive island AND the node unit tests can import it. Covers the three interactive behaviours
// the strip adds: team FILTERS, COMPARE mode, and the per-team HIGH/LOW readout (the spread).

/** One serialized trajectory row: champion probability at each retained step, index-aligned to steps. */
export interface TimeMachineRow {
  team: string;
  values: number[];
  /** "contender" (top by current odds) or "faller" (biggest since-kickoff drop); pool ordering only. */
  role?: "contender" | "faller";
  /** true for the single biggest since-kickoff faller (kept visible by default). */
  pinnedFaller?: boolean;
}

/** HIGH and LOW champion probability of a row across the whole retained window (the spread readout). */
export interface HighLow {
  high: number;
  low: number;
  spread: number;
  highIdx: number;
  lowIdx: number;
}

/** The HIGH and LOW of a team's champion probability over the whole retained window, with the step
 *  index each extreme first occurs at. Empty input degrades to zeros (never throws). */
export function highLow(values: number[]): HighLow {
  if (!values || values.length === 0) {
    return { high: 0, low: 0, spread: 0, highIdx: 0, lowIdx: 0 };
  }
  let high = values[0];
  let low = values[0];
  let highIdx = 0;
  let lowIdx = 0;
  for (let i = 1; i < values.length; i++) {
    const v = values[i];
    if (v > high) { high = v; highIdx = i; }
    if (v < low) { low = v; lowIdx = i; }
  }
  return { high, low, spread: high - low, highIdx, lowIdx };
}

/** The visible rows under the team FILTER. Preserves the pool order. An EMPTY selection falls soft to
 *  the whole pool so the strip is never blank (deselecting everything shows everything, not nothing). */
export function applyFilter(rows: TimeMachineRow[], selected: Set<string>): TimeMachineRow[] {
  if (!selected || selected.size === 0) return rows.slice();
  return rows.filter((r) => selected.has(r.team));
}

/** The COMPARE rows: the picked teams (in PICK order, so the head-to-head reads as the user built it),
 *  existing-in-pool only, capped at `max` (2-3). Order-preserving + dedup-safe. */
export function compareRows(rows: TimeMachineRow[], picks: string[], max = 3): TimeMachineRow[] {
  const byTeam = new Map(rows.map((r) => [r.team, r]));
  const out: TimeMachineRow[] = [];
  const seen = new Set<string>();
  for (const team of picks) {
    if (seen.has(team)) continue;
    const row = byTeam.get(team);
    if (!row) continue;
    seen.add(team);
    out.push(row);
    if (out.length >= max) break;
  }
  return out;
}

/** Toggle a team in an ordered pick list, capped at `max`. Returns a NEW array (adds to the end when
 *  absent and under the cap; removes when present; a no-op when adding past the cap). Pure. */
export function togglePick(picks: string[], team: string, max = 3): string[] {
  if (picks.includes(team)) return picks.filter((t) => t !== team);
  if (picks.length >= max) return picks;
  return [...picks, team];
}

/** The DEFAULT shown set. When a settled podium (four sides) is supplied and all four are present in
 *  the pool, the default IS the podium - the four teams that actually finished 1st..4th. Otherwise it
 *  falls back to the live default (top contenders + biggest faller). Constructed so a DEGENERATE
 *  current-odds order (champion at 1.0, every other team at exactly 0, so the table order collapses to
 *  champion-then-alphabetical) can NEVER leak into the settled default - the podium is read from the
 *  M104/M103 results, not from the odds table. Pure + testable; pins the derivation, not an output. */
export function pickDefaultSelection(
  podium: readonly string[] | null | undefined,
  fallback: readonly string[],
  present: (team: string) => boolean,
): string[] {
  const validPodium = (podium ?? []).filter((t) => !!t && present(t));
  // A valid podium is exactly four distinct present teams; anything short falls back to the live rule.
  const distinct = new Set(validPodium);
  return distinct.size === 4 ? [...validPodium] : [...fallback];
}

/** Case-insensitive substring search over a team/nation name (the Odds Time Machine chip-rail filter).
 *  An empty query matches everything (the whole rail shows). Pure. */
export function matchesQuery(team: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || team.toLowerCase().includes(q);
}
