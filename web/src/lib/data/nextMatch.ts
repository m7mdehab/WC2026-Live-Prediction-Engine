// "Next match" selection + compact card assembly for the home hero countdown toggle.
//
// The home hero can count down to the next STAGE (existing) or the NEXT MATCH (this module). The next
// match is the soonest UNPLAYED fixture that has a kickoff time AND both sides known. Knockout fixtures
// keep team_a/team_b NULL in the fixtures table until their feeder is decided; the resolved sides are
// overlaid upstream from the projected bracket (lib/data/resolveKo.overlayResolvedKo, the same rule the
// /matches list and match-detail loader use), so by the time a candidate reaches selectNextMatch a
// resolved knockout tie already carries real team names and an unresolved one is still NULL (and skipped).
//
// Everything here is PURE and DB-free so it is unit-testable without Supabase.

import { teamCode } from "@/lib/teamCodes";
import { nationFact } from "@/lib/data/nationFacts";
import type { UpcomingMatch } from "@/lib/types";

/** The minimal shape selectNextMatch needs. UpcomingMatch and a resolved-overlaid Fixture both satisfy it. */
export interface NextMatchCandidate {
  team_a: string | null;
  team_b: string | null;
  kickoff_utc: string | null;
  match_no: number;
  /** True when the fixture is completed (played). Optional so a bare Fixture-like object still fits. */
  finished?: boolean;
  /** A recorded result also means "played" (belt and braces with `finished`). */
  result?: unknown;
}

/**
 * The soonest UNPLAYED match with a kickoff time and BOTH sides known, or null when there is none
 * (tournament over, or nothing scheduled/resolved yet). Pure and order-independent: it re-filters and
 * re-sorts, so it is correct even on an unsorted list.
 *
 *  - skips played fixtures (finished flag OR a recorded result);
 *  - requires a parseable kickoff_utc (no kickoff -> not a countdown target);
 *  - requires both team_a and team_b (an unresolved knockout slot, still NULL, is excluded).
 */
export function selectNextMatch<T extends NextMatchCandidate>(matches: readonly T[]): T | null {
  const playable = matches.filter(
    (m) =>
      !m.finished &&
      m.result == null &&
      !!m.team_a &&
      !!m.team_b &&
      m.kickoff_utc != null &&
      Number.isFinite(Date.parse(m.kickoff_utc)),
  );
  playable.sort((a, b) => {
    const ka = a.kickoff_utc as string;
    const kb = b.kickoff_utc as string;
    return ka === kb ? a.match_no - b.match_no : ka.localeCompare(kb);
  });
  return playable[0] ?? null;
}

/** One team's compact facts for the next-match card. */
export interface NextMatchTeam {
  name: string;
  code: string;
  fifaRank: number | null;
  elo: number | null;
  /** Most-recent-first W/D/L results (trimmed to a compact tail). */
  form: ("W" | "D" | "L")[];
  /** Curated editorial fact, or null (the UI then omits this nation's line). */
  fact: string | null;
}

/** The compact, fully-serialisable payload the client CountdownHero renders in "next match" mode. */
export interface NextMatchCard {
  matchId: string;
  matchNo: number;
  kickoffUtc: string | null;
  city: string | null;
  country: string | null;
  /** Current model odds for this fixture (match_probabilities, latest run). Null when unavailable. */
  pA: number | null;
  pDraw: number | null;
  pB: number | null;
  teamA: NextMatchTeam;
  teamB: NextMatchTeam;
}

const FORM_TAIL = 5; // keep the form line compact

function teamStats(
  name: string,
  fifaRank: number | null,
  elo: number | null,
  form: { result: "W" | "D" | "L" }[] | undefined,
): NextMatchTeam {
  return {
    name,
    code: teamCode(name),
    fifaRank,
    elo: elo == null ? null : Math.round(elo),
    form: (form ?? []).slice(0, FORM_TAIL).map((f) => f.result),
    fact: nationFact(name),
  };
}

/**
 * Assemble the compact next-match card from a joined UpcomingMatch (fixture + probs + factors). Returns
 * null when the fixture is not a real, countable matchup (missing a side or a kickoff). Every field is
 * fail-soft: absent probabilities/factors simply become null and the UI omits that piece.
 */
export function buildNextMatchCard(m: UpcomingMatch | null | undefined): NextMatchCard | null {
  if (!m || !m.team_a || !m.team_b || !m.kickoff_utc) return null;
  const f = m.factors;
  return {
    matchId: m.match_id,
    matchNo: m.match_no,
    kickoffUtc: m.kickoff_utc,
    city: m.city,
    country: m.country,
    pA: m.probs?.p_team_a_win ?? null,
    pDraw: m.probs?.p_draw ?? null,
    pB: m.probs?.p_team_b_win ?? null,
    teamA: teamStats(m.team_a, f?.fifa_rank.team_a ?? null, f?.rating_gap.elo_a ?? null, f?.recent_form.team_a),
    teamB: teamStats(m.team_b, f?.fifa_rank.team_b ?? null, f?.rating_gap.elo_b ?? null, f?.recent_form.team_b),
  };
}
