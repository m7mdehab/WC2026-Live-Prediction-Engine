// teams types - owned by the teams track. Domain types for /teams (index) and /teams/[id] (profile).
// Derived from team_probabilities + teams + fixtures + match_probabilities + group_standings_projection
// for the current run. Rosters are deferred to V1.1 - no squad shape here.

import type { ModelPredictionRun } from "@/lib/types";

/** One team's stage-by-stage title odds (from team_probabilities), all in [0,1]; null = the model
 *  didn't publish that field for the team. The locked probability-display order: champion → group. */
export interface TeamForecast {
  champion: number | null;     // win the tournament
  reachFinal: number | null;   // finalist
  reachSf: number | null;      // reach the semi-finals
  reachQf: number | null;      // reach the quarter-finals
  advanceGroup: number | null; // survive the group
}

/** The team's projected finish in its group (from group_standings_projection, current run). */
export interface TeamGroupFinish {
  groupCode: string;
  projRank: number;        // 1..4 - single most-likely finishing position
  pWinGroup: number;       // P(1st)
  pTop2: number;           // P(1st)+P(2nd)
  pBestThird: number;      // P(qualify as a best-placed third)
  pQualify: number;        // pTop2 + pBestThird (≈ advance_group)
}

/** A row in the team's group ordering - used to render a compact projected table that links to /groups. */
export interface GroupMate {
  team: string;
  projRank: number;
  pQualify: number;
  isSelf: boolean;
}

/** One of a team's fixtures, joined with the model's match prediction. Carries the stadium `venue`
 *  so the row can show venue-local kickoff (the locked design rule) alongside the visitor-local time. */
export interface TeamFixture {
  matchId: string;
  matchNo: number;
  teamA: string;
  teamB: string;
  opponent: string;     // the other side, from this team's perspective
  teamIsHome: boolean;  // true when this team is team_a (the listed "home"/first side)
  venue: string | null; // stadium name (for venue-local time)
  city: string | null;
  country: string | null;
  kickoffUtc: string | null;
  pA: number | null;    // P(team_a win)
  pDraw: number | null;
  pB: number | null;    // P(team_b win)
  xgA: number | null;
  xgB: number | null;
  // Recorded result (match_results, team_a/team_b orientation), null until entered. `finished`
  // gates the score display; `winnerTeam` + a level `homeScore`/`awayScore` means the tie was
  // decided on penalties (KO only) and `pens` renders the "(pens)" note. All fail-soft.
  homeScore: number | null;
  awayScore: number | null;
  winnerTeam: string | null;
  finished: boolean;
  pens: boolean;
}

/** Everything a /teams/[id] profile renders, for the current run. */
export interface TeamProfile {
  id: string;            // url slug
  team: string;          // real country name
  groupCode: string | null;
  hostFlag: boolean;
  fifaRank: number | null;
  elo: number | null;
  forecast: TeamForecast;
  groupFinish: TeamGroupFinish | null;
  groupMates: GroupMate[]; // the 4-team projected ordering (incl. self), empty if no projection
  fixtures: TeamFixture[];
  run: ModelPredictionRun | null;
  demo: boolean;         // true when rendered from the offline TEAMS_DEMO fixture
}

/** One team card on the /teams index. */
export interface TeamIndexEntry {
  id: string;
  team: string;
  hostFlag: boolean;
  fifaRank: number | null;
  champion: number | null;     // headline title odds
  advanceGroup: number | null; // headline group-qualification odds
}

/** A group's slice of the /teams index. */
export interface TeamGroup {
  groupCode: string;
  teams: TeamIndexEntry[]; // sorted by champion% desc
}

/** Everything the /teams index renders, for the current run. */
export interface TeamsIndex {
  run: ModelPredictionRun | null;
  groups: TeamGroup[];   // A..L
  demo: boolean;
}
