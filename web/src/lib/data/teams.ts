// teams data layer - owned by the teams track. Reads team_probabilities + teams + fixtures +
// match_probabilities + group_standings_projection for the current run, and shapes them into the
// /teams index and the /teams/[id] profile.
//
// Convention (Wave 0): the shared lib/data.ts + lib/types.ts are edited only by live-ops; each track
// adds its reads in its own module. Elo comes from the locked teamElo map so the page speaks the same
// rating signal as the forecast / match / group pages.
//
// Static generation note: the /teams/[id] pages are prerendered (generateStaticParams over the 48
// ids). To stay statically generatable we read Supabase through a *cookie-free* anon client here
// (public, RLS-protected reads need no session) rather than the cookie-based server client - calling
// cookies() would force every team page to dynamic. When the env is absent (offline / no run) the
// loaders fall back to a clean empty state, or a deterministic TEAMS_DEMO fixture for local review.
import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { TEAM_ELO, teamElo } from "@/lib/teamElo";
import { teamSlug } from "@/lib/teamSlug";
import type {
  Fixture, ModelPredictionRun, TeamProbabilities, MatchProbabilities, GroupStandingRow, MatchResult,
} from "@/lib/types";
import type {
  TeamProfile, TeamForecast, TeamFixture, TeamGroupFinish, GroupMate,
  TeamsIndex, TeamGroup, TeamIndexEntry,
} from "@/lib/types/teams";

// ---------------------------------------------------------------------------------------------------
// Slugs - the canonical 48 team names (the locked Elo map) ↔ url ids. Diacritics are folded so
// "Curaçao" → "curacao"; spaces/punctuation collapse to single hyphens.
// ---------------------------------------------------------------------------------------------------
export { teamSlug }; // re-exported from @/lib/teamSlug (pure helper, shared with link sites)

/** The 48 team names, sorted, as the single source of truth for ids + offline rendering. */
export const TEAM_NAMES: string[] = Object.keys(TEAM_ELO).sort((a, b) => a.localeCompare(b));
const SLUG_TO_NAME: Record<string, string> = Object.fromEntries(
  TEAM_NAMES.map((n) => [teamSlug(n), n]),
);

/** The 48 ids for generateStaticParams (build-time, no DB - keeps prerender independent of Supabase). */
export function teamStaticParams(): { id: string }[] {
  return TEAM_NAMES.map((n) => ({ id: teamSlug(n) }));
}

/** Cookie-free anon client for public reads; null when the env isn't configured (offline build). */
function publicClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createSupabaseClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

// ---------------------------------------------------------------------------------------------------
// /teams index
// ---------------------------------------------------------------------------------------------------
async function loadIndexFromDb(): Promise<TeamsIndex | null> {
  const sb = publicClient();
  if (!sb) return null;

  const { data: runs, error: runErr } = await sb.from("current_run").select("*").limit(1);
  if (runErr) throw runErr;
  const run = (runs?.[0] as ModelPredictionRun | undefined) ?? null;
  if (!run) return null;

  const [tp, tm] = await Promise.all([
    sb.from("team_probabilities").select("*").eq("run_id", run.run_id),
    // scaling-guard-ok: teams is bounded by the tournament (48 rows, the qualified field)
    sb.from("teams").select("name, group_code, host_flag, fifa_rank"),
  ]);
  if (tp.error) throw tp.error;
  if (tm.error) throw tm.error;

  const probs = new Map<string, TeamProbabilities>(
    ((tp.data ?? []) as TeamProbabilities[]).map((p) => [p.team, p]),
  );
  const teams = (tm.data ?? []) as { name: string; group_code: string | null; host_flag: boolean; fifa_rank: number | null }[];
  if (teams.length === 0) return null;

  const byGroup = new Map<string, TeamIndexEntry[]>();
  for (const t of teams) {
    const code = t.group_code ?? "?";
    const p = probs.get(t.name);
    if (!byGroup.has(code)) byGroup.set(code, []);
    byGroup.get(code)!.push({
      id: teamSlug(t.name),
      team: t.name,
      hostFlag: t.host_flag,
      fifaRank: t.fifa_rank,
      champion: p?.champion ?? null,
      advanceGroup: p?.advance_group ?? null,
    });
  }
  return { run, groups: orderGroups(byGroup), demo: false };
}

export async function getTeamsIndex(): Promise<TeamsIndex> {
  try {
    const idx = await loadIndexFromDb();
    if (idx) return idx;
  } catch (err) {
    console.error("Failed to load teams index from Supabase:", err);
  }
  return demoIndex() ?? { run: null, groups: [], demo: false };
}

/** Group A..L, each sorted by champion% desc (then advance-group, then name). */
function orderGroups(byGroup: Map<string, TeamIndexEntry[]>): TeamGroup[] {
  return [...byGroup.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([groupCode, list]) => ({
      groupCode,
      teams: list.sort(
        (a, b) =>
          (b.champion ?? 0) - (a.champion ?? 0) ||
          (b.advanceGroup ?? 0) - (a.advanceGroup ?? 0) ||
          a.team.localeCompare(b.team),
      ),
    }));
}

// ---------------------------------------------------------------------------------------------------
// /teams/[id] profile
// ---------------------------------------------------------------------------------------------------
async function loadProfileFromDb(team: string, id: string): Promise<TeamProfile | null> {
  const sb = publicClient();
  if (!sb) return null;

  const { data: runs, error: runErr } = await sb.from("current_run").select("*").limit(1);
  if (runErr) throw runErr;
  const run = (runs?.[0] as ModelPredictionRun | undefined) ?? null;
  if (!run) return null;

  const [tp, tm, fx, mp, gs, mr] = await Promise.all([
    sb.from("team_probabilities").select("*").eq("run_id", run.run_id).eq("team", team).limit(1),
    sb.from("teams").select("name, group_code, host_flag, fifa_rank").eq("name", team).limit(1),
    sb.from("fixtures").select("*").eq("stage", "group").order("match_no"),
    sb.from("match_probabilities").select("*").eq("run_id", run.run_id),
    sb.from("group_standings_projection").select("*").eq("run_id", run.run_id),
    // scaling-guard-ok: match_results is bounded by the tournament (<=104 rows, one per match)
    sb.from("match_results").select("match_id, home_score, away_score, winner_team, status"),
  ]);
  for (const r of [tp, tm, fx, mp, gs, mr]) if (r.error) throw r.error;

  const meta = (tm.data?.[0] as { group_code: string | null; host_flag: boolean; fifa_rank: number | null } | undefined) ?? null;
  const prob = (tp.data?.[0] as TeamProbabilities | undefined) ?? null;
  const groupCode = meta?.group_code ?? null;

  const probsByMatch = new Map<string, MatchProbabilities>(
    ((mp.data ?? []) as MatchProbabilities[]).map((m) => [m.match_id, m]),
  );
  const resultsByMatch = new Map<string, MatchResult>(
    ((mr.data ?? []) as MatchResult[]).map((r) => [r.match_id, r]),
  );
  const fixtures = buildFixtures((fx.data ?? []) as Fixture[], team, probsByMatch, resultsByMatch);

  const gsRows = ((gs.data ?? []) as GroupStandingRow[]).filter((r) => r.group_code === groupCode);
  const { finish, mates } = buildGroupFinish(gsRows, team);

  return {
    id,
    team,
    groupCode,
    hostFlag: meta?.host_flag ?? false,
    fifaRank: meta?.fifa_rank ?? null,
    elo: teamElo(team),
    forecast: toForecast(prob),
    groupFinish: finish,
    groupMates: mates,
    fixtures,
    run,
    demo: false,
  };
}

export async function getTeamProfile(id: string): Promise<TeamProfile | null> {
  const team = SLUG_TO_NAME[id];
  if (!team) return null; // unknown slug → 404
  try {
    const profile = await loadProfileFromDb(team, id);
    if (profile) return profile;
  } catch (err) {
    console.error(`Failed to load team profile for "${team}":`, err);
  }
  // offline / no run: a deterministic fixture for local review, else a clean shell (header + empty
  // states) so the prerendered page still resolves 200.
  return demoProfile(team, id) ?? emptyProfile(team, id);
}

function toForecast(p: TeamProbabilities | null): TeamForecast {
  return {
    champion: p?.champion ?? null,
    reachFinal: p?.reach_final ?? null,
    reachSf: p?.reach_sf ?? null,
    reachQf: p?.reach_qf ?? null,
    advanceGroup: p?.advance_group ?? null,
  };
}

/** A team's group-stage fixtures (sorted by kickoff, then match_no), joined with the run's odds. */
function buildFixtures(
  fixtures: Fixture[],
  team: string,
  probsByMatch: Map<string, MatchProbabilities>,
  resultsByMatch?: Map<string, MatchResult>,
): TeamFixture[] {
  return fixtures
    .filter((f) => f.team_a === team || f.team_b === team)
    .sort((a, b) => {
      const ka = a.kickoff_utc ?? "", kb = b.kickoff_utc ?? "";
      return ka === kb ? a.match_no - b.match_no : ka.localeCompare(kb);
    })
    .map((f) => {
      const p = probsByMatch.get(f.match_id) ?? null;
      const r = resultsByMatch?.get(f.match_id) ?? null;
      const teamIsHome = f.team_a === team;
      const finished = r != null && (r.status === "completed" || r.home_score != null);
      const home = finished ? r!.home_score : null;
      const away = finished ? r!.away_score : null;
      // A decided tie (level score with a recorded winner) is a shootout - KO only, group ties stand.
      const pens = finished && home != null && away != null && home === away && !!r!.winner_team;
      return {
        matchId: f.match_id,
        matchNo: f.match_no,
        teamA: f.team_a as string,
        teamB: f.team_b as string,
        opponent: (teamIsHome ? f.team_b : f.team_a) as string,
        teamIsHome,
        venue: f.venue,
        city: f.city,
        country: f.country,
        kickoffUtc: f.kickoff_utc,
        pA: p?.p_team_a_win ?? null,
        pDraw: p?.p_draw ?? null,
        pB: p?.p_team_b_win ?? null,
        xgA: p?.exp_goals_a ?? null,
        xgB: p?.exp_goals_b ?? null,
        homeScore: home,
        awayScore: away,
        winnerTeam: finished ? r!.winner_team : null,
        finished,
        pens,
      };
    });
}

/** The team's projected finish + the 4-team ordering (for the compact table linking to /groups). */
function buildGroupFinish(
  rows: GroupStandingRow[],
  team: string,
): { finish: TeamGroupFinish | null; mates: GroupMate[] } {
  if (rows.length === 0) return { finish: null, mates: [] };
  const mates: GroupMate[] = rows
    .map((r) => ({
      team: r.team,
      projRank: r.proj_rank,
      pQualify: Math.min(1, r.p_first + r.p_second + r.p_best_third),
      isSelf: r.team === team,
    }))
    .sort((a, b) => a.projRank - b.projRank);

  const self = rows.find((r) => r.team === team);
  if (!self) return { finish: null, mates };
  const pTop2 = self.p_first + self.p_second;
  return {
    finish: {
      groupCode: self.group_code,
      projRank: self.proj_rank,
      pWinGroup: self.p_first,
      pTop2,
      pBestThird: self.p_best_third,
      pQualify: Math.min(1, pTop2 + self.p_best_third),
    },
    mates,
  };
}

function emptyProfile(team: string, id: string): TeamProfile {
  return {
    id, team,
    groupCode: null, hostFlag: false, fifaRank: null, elo: teamElo(team),
    forecast: { champion: null, reachFinal: null, reachSf: null, reachQf: null, advanceGroup: null },
    groupFinish: null, groupMates: [], fixtures: [], run: null, demo: false,
  };
}

// ===================================================================================================
// Offline fixture (TEAMS_DEMO=1) - dev-only, mirrors the forecast track's FORECAST_DEMO. Synthesises
// stage odds deterministically from the locked Elo ratings (with a host deep-run nudge), a projected
// group ordering, and each team's three round-robin group fixtures with model-shaped odds + real
// venues, so the page can be built / screenshotted / reviewed without a live Supabase connection.
// FIFA ranks / groups are inlined ONLY for this fixture (production reads the teams table).
// ===================================================================================================
const DEMO_FIFA: Record<string, number> = {
  Mexico: 15, "South Africa": 60, "South Korea": 25, "Czech Republic": 41,
  Canada: 30, "Bosnia and Herzegovina": 65, Qatar: 55, Switzerland: 19,
  Brazil: 6, Morocco: 8, Haiti: 83, Scotland: 43,
  "United States": 16, Paraguay: 40, Australia: 27, Turkey: 22,
  Germany: 10, "Curaçao": 82, "Ivory Coast": 34, Ecuador: 23,
  Netherlands: 7, Japan: 18, Sweden: 38, Tunisia: 44,
  Belgium: 9, Egypt: 29, Iran: 21, "New Zealand": 85,
  Spain: 2, "Cape Verde": 69, "Saudi Arabia": 61, Uruguay: 17,
  France: 1, Senegal: 14, Iraq: 57, Norway: 31,
  Argentina: 3, Algeria: 28, Austria: 24, Jordan: 63,
  Portugal: 5, "DR Congo": 46, Uzbekistan: 50, Colombia: 13,
  England: 4, Croatia: 11, Ghana: 74, Panama: 33,
};
const DEMO_GROUP: Record<string, string> = {
  Mexico: "A", "South Africa": "A", "South Korea": "A", "Czech Republic": "A",
  Canada: "B", "Bosnia and Herzegovina": "B", Qatar: "B", Switzerland: "B",
  Brazil: "C", Morocco: "C", Haiti: "C", Scotland: "C",
  "United States": "D", Paraguay: "D", Australia: "D", Turkey: "D",
  Germany: "E", "Curaçao": "E", "Ivory Coast": "E", Ecuador: "E",
  Netherlands: "F", Japan: "F", Sweden: "F", Tunisia: "F",
  Belgium: "G", Egypt: "G", Iran: "G", "New Zealand": "G",
  Spain: "H", "Cape Verde": "H", "Saudi Arabia": "H", Uruguay: "H",
  France: "I", Senegal: "I", Iraq: "I", Norway: "I",
  Argentina: "J", Algeria: "J", Austria: "J", Jordan: "J",
  Portugal: "K", "DR Congo": "K", Uzbekistan: "K", Colombia: "K",
  England: "L", Croatia: "L", Ghana: "L", Panama: "L",
};
const DEMO_HOSTS = new Set(["Mexico", "Canada", "United States"]);
const DEMO_VENUES: { venue: string; city: string }[] = [
  { venue: "Estadio Azteca", city: "Mexico City" },
  { venue: "MetLife Stadium", city: "New York" },
  { venue: "SoFi Stadium", city: "Los Angeles" },
  { venue: "AT&T Stadium", city: "Dallas" },
  { venue: "Mercedes-Benz Stadium", city: "Atlanta" },
  { venue: "BMO Field", city: "Toronto" },
];
const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

interface DemoTeam {
  team: string; group: string; fifa: number | null; host: boolean; elo: number;
  champion: number; reachFinal: number; reachSf: number; reachQf: number; advanceGroup: number;
}
let DEMO_CACHE: Map<string, DemoTeam> | null = null;

function buildDemoTeams(): Map<string, DemoTeam> {
  if (DEMO_CACHE) return DEMO_CACHE;
  const raw = TEAM_NAMES.map((team) => {
    const elo = TEAM_ELO[team];
    const hb = DEMO_HOSTS.has(team) ? 0.7 : 0;
    const advanceGroup = sigmoid((elo - 1815) / 55);
    const reachQf = advanceGroup * sigmoid((elo - 1895) / 75 + hb);
    const reachSf = reachQf * sigmoid((elo - 1945) / 70 + 0.5 * hb);
    const reachFinal = reachSf * sigmoid((elo - 1985) / 65);
    const championRaw = reachFinal * sigmoid((elo - 2010) / 60);
    return { team, elo, advanceGroup, reachQf, reachSf, reachFinal, championRaw };
  });
  const champSum = raw.reduce((s, r) => s + r.championRaw, 0) || 1;
  DEMO_CACHE = new Map(
    raw.map((r) => [r.team, {
      team: r.team, group: DEMO_GROUP[r.team] ?? "?", fifa: DEMO_FIFA[r.team] ?? null,
      host: DEMO_HOSTS.has(r.team), elo: r.elo,
      champion: r.championRaw / champSum, reachFinal: r.reachFinal, reachSf: r.reachSf,
      reachQf: r.reachQf, advanceGroup: r.advanceGroup,
    }]),
  );
  return DEMO_CACHE;
}

function demoEnabled(): boolean {
  return process.env.TEAMS_DEMO === "1";
}

function demoRun(): ModelPredictionRun {
  return {
    run_id: "demo", created_at: "2026-06-07T00:00:00Z",
    model_version: "demo-fixture", simulator_version: "demo", code_version: null,
    git_commit: null, data_version: null, data_hash: null, rng_seed: null,
    training_cutoff_date: null, data_cutoff_time: null, calibration_method: null,
    run_type: "demo", iterations: 50000, conditioned_on_results: 0,
  };
}

function demoIndex(): TeamsIndex | null {
  if (!demoEnabled()) return null;
  const teams = buildDemoTeams();
  const byGroup = new Map<string, TeamIndexEntry[]>();
  for (const t of teams.values()) {
    if (!byGroup.has(t.group)) byGroup.set(t.group, []);
    byGroup.get(t.group)!.push({
      id: teamSlug(t.team), team: t.team, hostFlag: t.host, fifaRank: t.fifa,
      champion: t.champion, advanceGroup: t.advanceGroup,
    });
  }
  return { run: demoRun(), groups: orderGroups(byGroup), demo: true };
}

/** Logistic match split from the Elo gap, with a draw share that widens as the sides level. */
function demoMatchProbs(eloA: number, eloB: number): { pA: number; pDraw: number; pB: number; xgA: number; xgB: number } {
  const paRaw = 1 / (1 + Math.pow(10, -(eloA - eloB) / 400));
  const pDraw = 0.30 * (1 - Math.abs(2 * paRaw - 1));
  const pA = paRaw * (1 - pDraw);
  const pB = (1 - paRaw) * (1 - pDraw);
  const xgA = 1.35 + (eloA - eloB) / 600;
  const xgB = 1.35 - (eloA - eloB) / 600;
  return { pA, pDraw, pB, xgA: Math.max(0.4, xgA), xgB: Math.max(0.4, xgB) };
}

function demoProfile(team: string, id: string): TeamProfile | null {
  if (!demoEnabled()) return null;
  const teams = buildDemoTeams();
  const self = teams.get(team);
  if (!self) return null;

  // group ordering by synthetic advance-group odds → proj ranks 1..4
  const groupTeams = [...teams.values()]
    .filter((t) => t.group === self.group)
    .sort((a, b) => b.advanceGroup - a.advanceGroup);
  const mates: GroupMate[] = groupTeams.map((t, i) => ({
    team: t.team, projRank: i + 1, pQualify: Math.min(1, t.advanceGroup), isSelf: t.team === team,
  }));
  const selfRank = groupTeams.findIndex((t) => t.team === team) + 1;
  const pWin = (() => {
    // softmax of Elo within the group → a plausible P(win group)
    const exps = groupTeams.map((t) => Math.exp((t.elo - self.elo) / 120));
    const sum = exps.reduce((s, e) => s + e, 0) || 1;
    return Math.exp(0) / sum; // self's term is exp(0)=1
  })();
  const finish: TeamGroupFinish = {
    groupCode: self.group,
    projRank: selfRank,
    pWinGroup: pWin,
    pTop2: Math.min(1, self.advanceGroup * 0.85),
    pBestThird: Math.max(0, self.advanceGroup - self.advanceGroup * 0.85),
    pQualify: Math.min(1, self.advanceGroup),
  };

  // three round-robin fixtures vs the other group members
  const opponents = groupTeams.filter((t) => t.team !== team);
  const fixtures: TeamFixture[] = opponents.map((opp, i) => {
    const teamIsHome = self.elo >= opp.elo; // deterministic home/away
    const home = teamIsHome ? self : opp;
    const away = teamIsHome ? opp : self;
    const mp = demoMatchProbs(home.elo, away.elo);
    const v = DEMO_VENUES[(self.group.charCodeAt(0) + i) % DEMO_VENUES.length];
    const day = 11 + i * 5; // 11, 16, 21 June 2026
    // Demo-only: mark the FIRST group fixture as completed with a deterministic Elo-shaped score so
    // the offline profile exercises the results row + form chips. Group ties stand (never pens).
    const played = i === 0;
    const hs = played ? Math.max(0, Math.round(1.2 + Math.max(0, (home.elo - away.elo) / 200))) : null;
    const as = played ? Math.max(0, Math.round(1.0 + Math.max(0, (away.elo - home.elo) / 200))) : null;
    const winner = played && hs != null && as != null && hs !== as ? (hs > as ? home.team : away.team) : null;
    return {
      matchId: `demo-${teamSlug(home.team)}-${teamSlug(away.team)}`,
      matchNo: 100 + i,
      teamA: home.team, teamB: away.team,
      opponent: opp.team, teamIsHome,
      venue: v.venue, city: v.city, country: "United States",
      kickoffUtc: `2026-06-${day}T19:00:00Z`,
      pA: mp.pA, pDraw: mp.pDraw, pB: mp.pB, xgA: mp.xgA, xgB: mp.xgB,
      homeScore: hs, awayScore: as, winnerTeam: winner, finished: played, pens: false,
    };
  });

  return {
    id, team,
    groupCode: self.group, hostFlag: self.host, fifaRank: self.fifa, elo: self.elo,
    forecast: {
      champion: self.champion, reachFinal: self.reachFinal, reachSf: self.reachSf,
      reachQf: self.reachQf, advanceGroup: self.advanceGroup,
    },
    groupFinish: finish, groupMates: mates, fixtures, run: demoRun(), demo: true,
  };
}
