// groups data layer - owned by the /groups track (Track 5).
//
// The Groups domain types are intentionally co-located in THIS module (not in lib/types/groups.ts)
// so the pure Article 13 engine below stays runnable as a bare-Node unit test - `node groups.ts`
// with type-stripping - without needing @-alias resolution or any next/server import.
//
// Web-computed group standings (decision 3A): standings for all 12 groups (A–L) are computed
// in TypeScript here, mirroring the simulator's FIFA Article 13 logic (simulator/tiebreakers.py).
// The chain is authoritative per docs/phase_1_corrections.md + data/group_rules_2026.json:
//
//   primary: points
//   step 1 (head-to-head, among the tied teams ONLY): 1a H2H points, 1b H2H GD, 1c H2H GS
//           → on partial separation, RE-APPLY 1a–1c to the still-tied subset (no restart)
//   step 2 (overall, no restart to step 1): 2d overall GD, 2e overall GS, 2f team conduct
//   step 3 (FIFA Ranking): 3g latest edition  (3h previous editions - see note below)
//
// No drawing of lots (FIFA does not use it for 2026 - Correction 2). FIFA ranks are unique among
// the 48 teams, so 3g always terminates; we append the team name as a final stable key so the
// sort is deterministic even if two ranks ever collided.
//
// Conduct (2f) is computed from the `events` table when present (yellow −1, indirect red −3,
// direct red −4, yellow+direct red −5; one most-severe deduction per player per match). The
// events schema (db/schema_g.sql) only carries `red_card` and `yellow_suspension` event types -
// there is no plain yellow-card event - so in practice conduct is a sparse proxy and the −3/−5
// combinations cannot arise from current data. This matches the simulator, which skips 2f
// entirely; ties surviving past overall GS are vanishingly rare (<1% of group instances).
//
// Convention: match_results.home_score / away_score are the fixture's team_a / team_b scores
// (confirmed in simulator/conditioned_sampler.py and db/recalc.py).

// ───────────────────────────────────────────────────────────────────────────────────────────
// Types (this track defines its own - lib/types.ts is reserved/live-ops only)
// ───────────────────────────────────────────────────────────────────────────────────────────

export type GroupStatus = "projected" | "live" | "final";

/** One team's computed (or projected) standing within its group. */
export interface TeamStanding {
  team: string;
  group_code: string;
  rank: number; // 1..4 (computed finishing order, or projected order when status==="projected")
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  gd: number;
  points: number;
  conduct: number; // team conduct score (≤ 0); 0 when no card events
  fifaRank: number | null;
  advanced: boolean; // top 2 of the group
  isThird: boolean; // finished 3rd (best-third contention)
  // projection (model) - sourced from the shared getGroupProjections() for the pre-tournament view
  pFirst: number | null; // P(win group)
  pQualify: number | null; // P(advance) = P(top-2) + P(best-third)
  pBestThird: number | null;
  projRank: number | null; // model's projected finishing rank (1..4)
}

/** A group fixture (scheduled or completed) for the upcoming/results list under a group card. */
export interface GroupFixture {
  match_id: string;
  match_no: number;
  team_a: string | null;
  team_b: string | null;
  kickoff_utc: string | null;
  city: string | null;
  country: string | null;
  status: "scheduled" | "completed";
  scoreA: number | null;
  scoreB: number | null;
}

export interface GroupStanding {
  group_code: string;
  status: GroupStatus;
  playedMatches: number; // completed matches in the group (0..6)
  totalMatches: number; // 6 (round-robin of 4)
  teams: TeamStanding[]; // ordered 1st..4th (computed rank, or projected order)
  fixtures: GroupFixture[]; // group fixtures, soonest first (completed shown with score)
}

/** One of the 12 third-placed teams, ranked for the best-8 qualification. */
export interface BestThird extends TeamStanding {
  rank: number; // 1..12 across all third-placed teams (overrides the within-group rank field)
  qualifies: boolean; // top 8
}

export interface GroupsData {
  groups: GroupStanding[];
  bestThirds: BestThird[];
  /** Overall page state: projected (no group has a result) · live (some) · final (all 12 done). */
  status: GroupStatus;
  /** True when at least one group has a completed match (best-thirds become computed, not modelled). */
  hasResults: boolean;
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// FIFA Article 13 engine (pure - no I/O - mirrors simulator/tiebreakers.py)
// ───────────────────────────────────────────────────────────────────────────────────────────

/** A completed group match: [team_a, team_b, score_a, score_b]. */
export type MatchResultTuple = [string, string, number, number];

export interface OverallStat {
  pts: number;
  gf: number;
  ga: number;
  gd: number;
  gs: number;
  p: number;
  w: number;
  d: number;
  l: number;
}

const WIN = 3;
const DRAW = 1;

/** points / GD / GS (+ W-D-L) over the given matches, restricted to the given team set. */
export function overallStats(teams: string[], results: MatchResultTuple[]): Record<string, OverallStat> {
  const st: Record<string, OverallStat> = {};
  for (const t of teams) st[t] = { pts: 0, gf: 0, ga: 0, gd: 0, gs: 0, p: 0, w: 0, d: 0, l: 0 };
  const tset = new Set(teams);
  for (const [a, b, sa, sb] of results) {
    if (!tset.has(a) || !tset.has(b)) continue;
    st[a].gf += sa; st[a].ga += sb; st[a].p += 1;
    st[b].gf += sb; st[b].ga += sa; st[b].p += 1;
    if (sa > sb) { st[a].pts += WIN; st[a].w += 1; st[b].l += 1; }
    else if (sb > sa) { st[b].pts += WIN; st[b].w += 1; st[a].l += 1; }
    else { st[a].pts += DRAW; st[b].pts += DRAW; st[a].d += 1; st[b].d += 1; }
  }
  for (const t of teams) { st[t].gd = st[t].gf - st[t].ga; st[t].gs = st[t].gf; }
  return st;
}

/** Compare two numeric keys element-wise (ascending - callers negate for "higher is better"). */
function cmpNumKey(x: number[], y: number[]): number {
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** Sort by key, then split into blocks of teams sharing the EXACT same key (preserving order). */
function partition(teams: string[], key: (t: string) => number[]): string[][] {
  const ordered = [...teams].sort((a, b) => cmpNumKey(key(a), key(b)));
  const blocks: string[][] = [];
  let cur: string[] = [];
  let curKey: number[] | null = null;
  for (const t of ordered) {
    const k = key(t);
    if (curKey === null || cmpNumKey(k, curKey) !== 0) {
      if (cur.length) blocks.push(cur);
      cur = [t];
      curKey = k;
    } else {
      cur.push(t);
    }
  }
  if (cur.length) blocks.push(cur);
  return blocks;
}

export interface RankContext {
  results: MatchResultTuple[]; // all completed matches in the group
  overall: Record<string, OverallStat>; // overall stats over the group
  conduct: Record<string, number>; // team conduct score (≤ 0)
  fifaRank: Record<string, number | null>; // latest FIFA Ranking (lower = better)
}

/** Terminal step 3g: order by latest FIFA Ranking (lower = better), name as a stable final key.
 *  (3h "previous editions" is not separately available in the web data layer; the unique latest
 *  rank already guarantees termination, and the name key makes any residual order deterministic.) */
function byFifa(teams: string[], ctx: RankContext): string[] {
  return [...teams].sort((a, b) => {
    const ra = ctx.fifaRank[a] ?? 1e6;
    const rb = ctx.fifaRank[b] ?? 1e6;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

/** Step 2: overall GD (2d) → overall GS (2e) → conduct (2f); residual ties → FIFA (3g). */
function breakByOverall(block: string[], ctx: RankContext): string[] {
  const keyFns: Array<(t: string) => number[]> = [
    (t) => [-ctx.overall[t].gd],
    (t) => [-ctx.overall[t].gs],
    (t) => [-(ctx.conduct[t] ?? 0)], // 2f: higher (less negative) conduct ranks higher; clean team = 0
  ];
  let blocks: string[][] = [block];
  for (const keyFn of keyFns) {
    const next: string[][] = [];
    for (const b of blocks) {
      if (b.length === 1) { next.push(b); continue; }
      for (const sub of partition(b, keyFn)) next.push(sub);
    }
    blocks = next;
  }
  const out: string[] = [];
  for (const b of blocks) {
    if (b.length === 1) out.push(b[0]);
    else out.push(...byFifa(b, ctx)); // FIFA Ranking terminal step
  }
  return out;
}

/** Resolve a block of teams equal on points: step 1 head-to-head (with re-apply), then step 2. */
function breakBlock(block: string[], ctx: RankContext): string[] {
  if (block.length === 1) return [...block];

  // Step 1 - head-to-head: stats restricted to matches BETWEEN teams in this block only.
  const h2h = overallStats(block, ctx.results);
  const subs = partition(block, (t) => [-h2h[t].pts, -h2h[t].gd, -h2h[t].gs]);

  if (subs.length === 1) {
    // head-to-head separated nothing → proceed to step 2 (overall), no restart.
    return breakByOverall(block, ctx);
  }

  // Partial (or full) separation → RE-APPLY step 1 to each still-tied subset only.
  const out: string[] = [];
  for (const sub of subs) {
    if (sub.length === 1) out.push(sub[0]);
    else out.push(...breakBlock(sub, ctx));
  }
  return out;
}

/** Order the group's teams 1st..4th per FIFA Article 13. */
export function rankGroup(teams: string[], ctx: RankContext): string[] {
  const out: string[] = [];
  for (const block of partition(teams, (t) => [-ctx.overall[t].pts])) {
    if (block.length === 1) out.push(block[0]);
    else out.push(...breakBlock(block, ctx));
  }
  return out;
}

/** Rank third-placed teams across groups (NO head-to-head - they have not met):
 *  points → overall GD → overall GS → conduct → FIFA Ranking. Best-first. */
export function rankThirds(
  thirds: string[],
  overall: Record<string, OverallStat>,
  conduct: Record<string, number>,
  fifaRank: Record<string, number | null>
): string[] {
  return [...thirds].sort((a, b) => {
    const d = cmpNumKey(
      [-overall[a].pts, -overall[a].gd, -overall[a].gs, -(conduct[a] ?? 0)],
      [-overall[b].pts, -overall[b].gd, -overall[b].gs, -(conduct[b] ?? 0)]
    );
    if (d !== 0) return d;
    const ra = fifaRank[a] ?? 1e6;
    const rb = fifaRank[b] ?? 1e6;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// Conduct (2f) from the events table - most-severe deduction per player per match
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface ConductEvent {
  match_id: string;
  team: string | null;
  player: string | null;
  event_type: string;
}

/** Deduction for a single card event (the values FIFA Article 13 §2f specifies). The events
 *  schema only emits `red_card` / `yellow_suspension`, so only −4 / −1 can occur today. */
function eventDeduction(eventType: string): number {
  switch (eventType) {
    case "red_card": return -4; // direct red
    case "yellow_suspension": return -1; // yellow (accumulation proxy - no plain-yellow event exists)
    default: return 0; // injury / extra_time / penalty_shootout / key_sub / manual_note / half_time
  }
}

/** Team conduct score from card events in completed matches: one most-severe deduction per
 *  player per match, summed per team. Teams with no card events score 0. */
export function conductFromEvents(events: ConductEvent[], completedMatchIds: Set<string>): Record<string, number> {
  const perKey = new Map<string, number>(); // `${team}|${match}|${player}` → most-severe (most negative)
  for (const e of events) {
    if (!e.team || !completedMatchIds.has(e.match_id)) continue;
    const d = eventDeduction(e.event_type);
    if (d === 0) continue;
    const key = `${e.team}|${e.match_id}|${e.player ?? ""}`;
    const cur = perKey.get(key);
    if (cur == null || d < cur) perKey.set(key, d);
  }
  const byTeam: Record<string, number> = {};
  for (const [key, d] of perKey) {
    const team = key.slice(0, key.indexOf("|"));
    byTeam[team] = (byTeam[team] ?? 0) + d;
  }
  return byTeam;
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// Standings assembly (pure - turns rows into the rendered shape) so it can be unit-tested
// ───────────────────────────────────────────────────────────────────────────────────────────

export interface TeamRow {
  name: string;
  group_code: string;
  fifa_rank: number | null;
}
export interface FixtureRow {
  match_id: string;
  match_no: number;
  group_code: string | null;
  team_a: string | null;
  team_b: string | null;
  kickoff_utc: string | null;
  city: string | null;
  country: string | null;
  status: string;
}
export interface ResultRow {
  match_id: string;
  home_score: number;
  away_score: number;
  status: string;
}
/** Normalized projection per team - flattened from the shared getGroupProjections() loader so the
 *  pure builder never depends on the reserved lib/data shapes. */
export interface ProjectionRow {
  group_code: string;
  team: string;
  pFirst: number | null; // P(win group)
  pQualify: number | null; // P(advance)
  pBestThird: number | null;
  projRank: number; // projected finishing rank (1..4)
}

const GROUP_CODES = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

/** Build the full /groups view from raw rows. Pure - the loader fetches, this computes. */
export function buildGroupsData(
  teams: TeamRow[],
  fixtures: FixtureRow[],
  results: ResultRow[],
  events: ConductEvent[],
  projections: ProjectionRow[]
): GroupsData {
  const teamsByGroup = new Map<string, TeamRow[]>();
  for (const t of teams) {
    if (!teamsByGroup.has(t.group_code)) teamsByGroup.set(t.group_code, []);
    teamsByGroup.get(t.group_code)!.push(t);
  }
  const fifaRank: Record<string, number | null> = {};
  for (const t of teams) fifaRank[t.name] = t.fifa_rank;

  const groupFixtures = fixtures
    .filter((f) => f.group_code && GROUP_CODES.includes(f.group_code))
    .sort((a, b) => a.match_no - b.match_no);
  const fixturesByGroup = new Map<string, FixtureRow[]>();
  for (const f of groupFixtures) {
    if (!fixturesByGroup.has(f.group_code!)) fixturesByGroup.set(f.group_code!, []);
    fixturesByGroup.get(f.group_code!)!.push(f);
  }

  const resultByMatch = new Map<string, ResultRow>();
  for (const r of results) if (r.status === "completed") resultByMatch.set(r.match_id, r);
  const completedMatchIds = new Set<string>([...resultByMatch.keys()]);

  const conduct = conductFromEvents(events, completedMatchIds);

  const projByTeam = new Map<string, ProjectionRow>();
  for (const p of projections) projByTeam.set(p.team, p);

  const groups: GroupStanding[] = [];

  for (const code of GROUP_CODES) {
    const groupTeams = (teamsByGroup.get(code) ?? []).map((t) => t.name);
    if (groupTeams.length === 0) continue;
    const fx = fixturesByGroup.get(code) ?? [];

    // completed results among this group's fixtures, as engine tuples (home→team_a, away→team_b)
    const tuples: MatchResultTuple[] = [];
    for (const f of fx) {
      const r = resultByMatch.get(f.match_id);
      if (r && f.team_a && f.team_b) tuples.push([f.team_a, f.team_b, r.home_score, r.away_score]);
    }
    const playedMatches = tuples.length;
    const totalMatches = fx.length || 6;
    const status: GroupStatus =
      playedMatches === 0 ? "projected" : playedMatches >= totalMatches ? "final" : "live";

    const overall = overallStats(groupTeams, tuples);
    const ctx: RankContext = { results: tuples, overall, conduct, fifaRank };

    const fixtureList: GroupFixture[] = fx.map((f) => {
      const r = resultByMatch.get(f.match_id);
      return {
        match_id: f.match_id,
        match_no: f.match_no,
        team_a: f.team_a,
        team_b: f.team_b,
        kickoff_utc: f.kickoff_utc,
        city: f.city,
        country: f.country,
        status: r ? "completed" : "scheduled",
        scoreA: r ? r.home_score : null,
        scoreB: r ? r.away_score : null,
      };
    });

    let ordered: string[];
    if (status === "projected") {
      // pre-tournament: render in the model's projected order (from getGroupProjections)
      ordered = [...groupTeams].sort(
        (a, b) => (projByTeam.get(a)?.projRank ?? 99) - (projByTeam.get(b)?.projRank ?? 99)
      );
    } else {
      ordered = rankGroup(groupTeams, ctx);
    }

    const teamStandings: TeamStanding[] = ordered.map((name, i) => {
      const s = overall[name];
      const proj = projByTeam.get(name);
      const rank = i + 1;
      return {
        team: name,
        group_code: code,
        rank,
        played: s.p,
        won: s.w,
        drawn: s.d,
        lost: s.l,
        gf: s.gf,
        ga: s.ga,
        gd: s.gd,
        points: s.pts,
        conduct: conduct[name] ?? 0,
        fifaRank: fifaRank[name] ?? null,
        advanced: rank <= 2,
        isThird: rank === 3,
        pFirst: proj?.pFirst ?? null,
        pQualify: proj?.pQualify ?? null,
        pBestThird: proj?.pBestThird ?? null,
        projRank: proj?.projRank ?? null,
      };
    });

    groups.push({ group_code: code, status, playedMatches, totalMatches, teams: teamStandings, fixtures: fixtureList });
  }

  // Overall page status + best-thirds.
  const totalPlayed = groups.reduce((n, g) => n + g.playedMatches, 0);
  const allFinal = groups.length > 0 && groups.every((g) => g.status === "final");
  const overallStatus: GroupStatus = totalPlayed === 0 ? "projected" : allFinal ? "final" : "live";
  const hasResults = totalPlayed > 0;

  // The 12 third-placed teams (one per group).
  const thirdStandings = groups.map((g) => g.teams.find((t) => t.rank === 3)).filter(Boolean) as TeamStanding[];

  let rankedThirds: TeamStanding[];
  if (!hasResults) {
    // pre-tournament: rank by the model's best-third probability (no stats to rank on yet)
    rankedThirds = [...thirdStandings].sort((a, b) => (b.pBestThird ?? 0) - (a.pBestThird ?? 0));
  } else {
    const thirdOverall: Record<string, OverallStat> = {};
    const thirdConduct: Record<string, number> = {};
    const thirdFifa: Record<string, number | null> = {};
    for (const t of thirdStandings) {
      thirdOverall[t.team] = { pts: t.points, gf: t.gf, ga: t.ga, gd: t.gd, gs: t.gf, p: t.played, w: t.won, d: t.drawn, l: t.lost };
      thirdConduct[t.team] = t.conduct;
      thirdFifa[t.team] = t.fifaRank;
    }
    const order = rankThirds(thirdStandings.map((t) => t.team), thirdOverall, thirdConduct, thirdFifa);
    const byName = new Map(thirdStandings.map((t) => [t.team, t]));
    rankedThirds = order.map((n) => byName.get(n)!);
  }

  const bestThirds: BestThird[] = rankedThirds.map((t, i) => ({ ...t, rank: i + 1, qualifies: i < 8 }));

  return { groups, bestThirds, status: overallStatus, hasResults };
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// Loader (server-side). The Supabase client is imported lazily so the pure engine above stays
// importable in isolation (unit tests / Node) without pulling next/headers.
// ───────────────────────────────────────────────────────────────────────────────────────────

function isLocalPreview(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.GROUPS_LOCAL_PREVIEW === "1";
}

/** The full /groups payload for the current run: 12 computed group tables + best-thirds. */
export async function getGroupsData(): Promise<GroupsData> {
  let sb;
  try {
    // C1: cookie-free public client (was the cookie-bound server client, which forced /groups dynamic in
    // violation of the cache.ts contract). Dynamic import kept so the pure engine stays bare-Node runnable.
    const mod = await import("@/lib/supabase/public");
    sb = mod.publicClient();
  } catch (err) {
    if (isLocalPreview()) return buildPreviewData();
    throw err;
  }

  try {
    // The projected/pre-tournament order + odds come from the shared, already-built loader
    // (it wraps group_standings_projection on the current run). Imported read-only - never edited.
    const dataMod = await import("@/lib/data");

    const [tm, fx, res, projGroups] = await Promise.all([
      // scaling-guard-ok: teams is bounded by the tournament (48 rows, the qualified field)
      sb.from("teams").select("name, group_code, fifa_rank"),
      sb.from("fixtures").select("match_id, match_no, group_code, team_a, team_b, kickoff_utc, city, country, status").eq("stage", "group"),
      // scaling-guard-ok: match_results is bounded by the tournament (<=104 rows, one per match)
      sb.from("match_results").select("match_id, home_score, away_score, status"),
      dataMod.getGroupProjections(),
    ]);
    if (tm.error) throw tm.error;
    if (fx.error) throw fx.error;
    if (res.error) throw res.error;

    // flatten GroupProjection[] → normalized ProjectionRow[] (the pure builder stays decoupled)
    const projections: ProjectionRow[] = projGroups.flatMap((g) =>
      g.teams.map((t) => ({
        group_code: g.group_code,
        team: t.team,
        pFirst: t.pWinGroup,
        pQualify: t.pQualify,
        pBestThird: t.pBestThird,
        projRank: t.predRank,
      }))
    );

    // events table may not be migrated in every environment - degrade gracefully (conduct → 0).
    let events: ConductEvent[] = [];
    try {
      // scaling-guard-ok: events is bounded by the tournament (goals/cards across <=104 matches)
      const ev = await sb.from("events").select("match_id, team, player, event_type");
      if (!ev.error) events = (ev.data ?? []) as ConductEvent[];
    } catch {
      /* events not present → conduct stays empty */
    }

    return buildGroupsData(
      (tm.data ?? []) as TeamRow[],
      (fx.data ?? []) as FixtureRow[],
      (res.data ?? []) as ResultRow[],
      events,
      projections
    );
  } catch (err) {
    if (isLocalPreview()) return buildPreviewData();
    throw err;
  }
}

// ───────────────────────────────────────────────────────────────────────────────────────────
// Dev-only preview data (NODE_ENV!=production && GROUPS_LOCAL_PREVIEW=1) - lets the page render
// all three states (final / live / projected), a forced 3-way points tie (Group A, resolved by
// head-to-head) and a FIFA-Ranking terminal tie (Group B), and the best-thirds table, with no
// Supabase. Never reachable in a production build.
// ───────────────────────────────────────────────────────────────────────────────────────────

const PREVIEW_TEAMS: Array<[string, string, number]> = [
  ["Mexico", "A", 15], ["South Africa", "A", 60], ["South Korea", "A", 25], ["Czech Republic", "A", 41],
  ["Canada", "B", 30], ["Bosnia and Herzegovina", "B", 65], ["Qatar", "B", 55], ["Switzerland", "B", 19],
  ["Brazil", "C", 6], ["Morocco", "C", 8], ["Haiti", "C", 83], ["Scotland", "C", 43],
  ["United States", "D", 16], ["Paraguay", "D", 40], ["Australia", "D", 27], ["Turkey", "D", 22],
  ["Germany", "E", 10], ["Curaçao", "E", 82], ["Ivory Coast", "E", 34], ["Ecuador", "E", 23],
  ["Netherlands", "F", 7], ["Japan", "F", 18], ["Sweden", "F", 38], ["Tunisia", "F", 44],
  ["Belgium", "G", 9], ["Egypt", "G", 29], ["Iran", "G", 21], ["New Zealand", "G", 85],
  ["Spain", "H", 2], ["Cape Verde", "H", 69], ["Saudi Arabia", "H", 61], ["Uruguay", "H", 17],
  ["France", "I", 1], ["Senegal", "I", 14], ["Iraq", "I", 57], ["Norway", "I", 31],
  ["Argentina", "J", 3], ["Algeria", "J", 28], ["Austria", "J", 24], ["Jordan", "J", 63],
  ["Portugal", "K", 5], ["DR Congo", "K", 46], ["Uzbekistan", "K", 50], ["Colombia", "K", 13],
  ["England", "L", 4], ["Croatia", "L", 11], ["Ghana", "L", 74], ["Panama", "L", 33],
];

/** Round-robin fixture order for a group of 4 (match indices 1..6): pairings used by the preview. */
const RR_PAIRS: Array<[number, number]> = [[0, 1], [2, 3], [0, 2], [1, 3], [0, 3], [1, 2]];

function buildPreviewData(): GroupsData {
  const teams: TeamRow[] = PREVIEW_TEAMS.map(([name, group_code, fifa_rank]) => ({ name, group_code, fifa_rank }));

  const fixtures: FixtureRow[] = [];
  const results: ResultRow[] = [];
  let matchNo = 0;

  // forced scorelines per group (by group code) → home/away for each of the 6 RR matches.
  // null entries = not yet played (so a group can be partially complete = "live").
  const SCRIPTS: Record<string, Array<[number, number] | null>> = {
    // Group A - 3-way tie on 6 pts (MEX/KOR/CZE), RSA 0. Cycle MEX>KOR>CZE>MEX; all beat RSA.
    // H2H GD fully separates: MEX +1, KOR 0, CZE −1 → demonstrates head-to-head resolves first.
    // RR_PAIRS for A = [MEX,RSA],[KOR,CZE],[MEX,KOR],[RSA,CZE],[MEX,CZE],[RSA,KOR]
    A: [[2, 0], [2, 0], [2, 0], [0, 1], [0, 1], [0, 2]],
    // Group B - SUI & BIH identical on pts/H2H/GD/GS → FIFA Ranking terminal step picks SUI (19<65).
    // RR_PAIRS for B = [CAN,BIH],[QAT,SUI],[CAN,QAT],[BIH,SUI],[CAN,SUI],[BIH,QAT]
    B: [[0, 2], [0, 2], [0, 1], [1, 1], [0, 2], [2, 0]],
    // Group C - LIVE: only the first 3 of 6 matches played.
    // RR_PAIRS for C = [BRA,MAR],[HAI,SCO],[BRA,HAI],[MAR,SCO],[BRA,SCO],[MAR,HAI]
    C: [[2, 1], [0, 0], [3, 0], null, null, null],
  };

  for (const code of GROUP_CODES) {
    const gTeams = teams.filter((t) => t.group_code === code);
    const script = SCRIPTS[code];
    RR_PAIRS.forEach((pair, i) => {
      matchNo += 1;
      const id = `M${String(matchNo).padStart(3, "0")}`;
      const a = gTeams[pair[0]].name;
      const b = gTeams[pair[1]].name;
      const score = script?.[i] ?? null;
      const day = 11 + Math.floor(i / 2); // June 11/12/13 (matchday 1/2/3)
      fixtures.push({
        match_id: id, match_no: matchNo, group_code: code, team_a: a, team_b: b,
        kickoff_utc: `2026-06-${String(day).padStart(2, "0")}T18:00:00Z`,
        city: "Preview City", country: "Preview", status: score ? "completed" : "scheduled",
      });
      if (score) results.push({ match_id: id, home_score: score[0], away_score: score[1], status: "completed" });
    });
  }

  // synthetic projection (mirrors getGroupProjections' per-team shape): projRank by seed order;
  // descending win odds; the 3rd seed carries the best-third odds.
  const projections: ProjectionRow[] = [];
  for (const code of GROUP_CODES) {
    const gTeams = teams.filter((t) => t.group_code === code);
    gTeams.forEach((t, i) => {
      const pFirst = [0.55, 0.25, 0.13, 0.07][i];
      const pTop2 = pFirst + [0.25, 0.35, 0.25, 0.15][i];
      const pBestThird = i === 2 ? 0.35 - GROUP_CODES.indexOf(code) * 0.02 : 0.05;
      projections.push({
        group_code: code, team: t.name, projRank: i + 1,
        pFirst, pQualify: Math.min(1, pTop2 + pBestThird), pBestThird,
      });
    });
  }

  return buildGroupsData(teams, fixtures, results, [], projections);
}
