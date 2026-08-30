// Wave 1.3 - goalscorers + bookings for a finished match, from public.player_match_stats (data we
// already ingest; pure display, no new ingestion). Kept free of "server-only" and any Supabase import
// so the pure transform is unit-testable. player_match_stats has NO per-event minute, so lines carry
// tallies (goals / own goals / cards), not minutes.
import type { MatchContributions, MatchPlayerLine } from "@/lib/types";

export interface RawMatchStat {
  player_id: string;
  goals: number | null;
  own_goals: number | null;
  yellow: number | null;
  red: number | null;
}
export interface PlayerIdentity {
  name: string;
  nation: string | null;
}

/** Readable fallback name from a slug id ("spain-unai-simon" -> "Spain Unai Simon") when the players
 *  row is absent (actuals-only players are never dropped). Display only; attribution still requires a
 *  real nation, so an identity-less row is left unattributed rather than guessed onto a team. */
export function humanizeSlug(id: string): string {
  return id
    .split("-")
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

const n = (x: number | null | undefined): number =>
  typeof x === "number" && Number.isFinite(x) ? x : 0;

const byImpact = (a: MatchPlayerLine, b: MatchPlayerLine): number =>
  b.goals - a.goals || b.own_goals - a.own_goals || b.red - a.red || b.yellow - a.yellow ||
  a.name.localeCompare(b.name);

/** Group each contributing player (any goal / own goal / card) under the team they belong to, keyed
 *  by nation == team_a / team_b. A row whose nation matches neither side is dropped (never guessed).
 *  Returns null when no player contributed anything, so the renderer hides the card. */
export function buildContributions(
  rows: RawMatchStat[],
  identityById: Map<string, PlayerIdentity>,
  teamA: string,
  teamB: string,
): MatchContributions | null {
  const out: MatchContributions = { team_a: [], team_b: [] };
  for (const r of rows) {
    const goals = n(r.goals), own_goals = n(r.own_goals), yellow = n(r.yellow), red = n(r.red);
    if (goals === 0 && own_goals === 0 && yellow === 0 && red === 0) continue;
    const id = identityById.get(r.player_id) ?? null;
    const side = id?.nation === teamA ? "team_a" : id?.nation === teamB ? "team_b" : null;
    if (side === null) continue; // unknown nation -> cannot attribute; leave out rather than misplace
    out[side].push({
      player_id: r.player_id,
      name: id?.name ?? humanizeSlug(r.player_id),
      goals, own_goals, yellow, red,
    });
  }
  out.team_a.sort(byImpact);
  out.team_b.sort(byImpact);
  return out.team_a.length === 0 && out.team_b.length === 0 ? null : out;
}
