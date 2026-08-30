// players data layer - owned by the players track. Mirrors forecast.ts: cookie-free publicClient +
// cachedRead keyed by the live data-version (so a player-stat write or a new run busts these reads).
// Reads public.players + public.player_projections + public.player_match_stats. All reads fail-soft
// to empty arrays / null so the feature degrades gracefully (e.g. before the migration is applied,
// or when no run is published). NOT called by any page until Phase 5.
import "server-only";
import { publicClient } from "@/lib/supabase/public";
import { selectAll } from "@/lib/data/paginate";
import { cachedRead, TAGS } from "@/lib/data/cache";
import { selectLatestGeneration, projectionMetaFromRows } from "@/lib/data/projectionGeneration";
import type {
  AwardRaceEntry, AwardRaces, AwardVerdict, PlayerIdentity, PlayerIndexRow,
  PlayerMatchStat, PlayerProfile, PlayerProjection, PlayerGoals, PositionLeaders,
  ProjectionMeta,
} from "@/lib/types/players";

// The finishing_factor metric ships as a player_projections row (bands null) but is NOT a board entry
// and must not appear in the raw profile projections[] list or the index headline -- it is surfaced
// only as PlayerProfile.finishingFactor. Filter it out everywhere it could leak.
const FINISHING_FACTOR_METRIC = "finishing_factor";

// The select column list for player_projections, carrying the freshness fields the read guard needs.
const PROJECTION_COLS =
  "player_id, metric, expected_value, band_low, band_high, computed_at, source_run_id";

// How many players each award leaderboard surfaces.
const LEADERBOARD_SIZE = 10;

// The role-appropriate headline metric the index sorts over/under-performance by.
const HEADLINE_BY_ROLE: Record<string, string> = {
  FW: "expected_goals",
  MF: "expected_assists",
  DF: "expected_clean_sheets",
  GK: "expected_clean_sheets",
};

// Map of headline metric -> the player_match_stats column whose running total it compares against.
const ACTUAL_COLUMN: Record<string, keyof PlayerMatchStat> = {
  expected_goals: "goals",
  expected_assists: "assists",
  expected_clean_sheets: "cleanSheet",
};

/** Pick the player's STRONGEST actual contribution for the index DISPLAY, so a scorer is surfaced by
 *  the metric they have actually produced (goals vs assists) rather than a zero role-headline. Each
 *  candidate is the actual paired with its MATCHING expected (goals-vs-expected-goals,
 *  assists-vs-expected-assists), never a cross-metric pairing. When the player has not contributed in
 *  goals or assists yet (both actuals 0), fall back to the role headline so a GK shows clean sheets
 *  and a goalless striker still shows expected goals. NEVER invents an expected: a missing projection
 *  stays null (the cell renders the actual with a dash expected).
 *
 *  acc may be undefined (no match log yet) -> actuals are 0. */
function strongestContribution(
  acc: { goals: number; assists: number; cleanSheet: number } | undefined,
  expectedGoals: number | null,
  expectedAssists: number | null,
  headlineMetric: string | null,
  headlineExpected: number | null,
  headlineActual: number,
): { metric: string | null; actual: number; expected: number | null } {
  const goals = acc?.goals ?? 0;
  const assists = acc?.assists ?? 0;
  // Goals lead ties (a scorer reads as a scorer). Only consider a metric a "contribution" when the
  // player has actually produced it (actual > 0); otherwise we have nothing real to surface and fall
  // back to the role headline.
  if (goals > 0 && goals >= assists) {
    return { metric: "expected_goals", actual: goals, expected: expectedGoals };
  }
  if (assists > 0) {
    return { metric: "expected_assists", actual: assists, expected: expectedAssists };
  }
  // No goal/assist contribution yet: show the role headline (clean sheets for GK/DF, expected goals
  // for a goalless FW, expected assists for a goalless MF). Honest zero against the role expectation.
  return { metric: headlineMetric, actual: headlineActual, expected: headlineExpected };
}

// ---- row shapes as they come back from Supabase (snake_case) -------------------------------------
interface PlayerRow {
  id: string; name: string; nation: string; team: string | null;
  role: string | null; sub_role: string | null; club: string | null;
  has_baseline: boolean; tracked: boolean;
  statsbomb_player_id: number | null;
  percentiles: Record<string, number> | null;
}
interface ProjectionRow {
  player_id: string; metric: string;
  expected_value: number | null; band_low: number | null; band_high: number | null;
  computed_at?: string | null; source_run_id?: string | null;
}
interface MatchStatRow {
  player_id: string; match_id: string;
  minutes: number | null; goals: number | null; assists: number | null; shots: number | null;
  xg: number | null; xa: number | null; passes: number | null; pass_completion: number | null;
  key_passes: number | null; progressive_passes: number | null; duels_won: number | null;
  saves: number | null; goals_conceded: number | null; clean_sheet: boolean | null;
  yellow: number | null; red: number | null; source: string; locked: boolean;
}

function toIdentity(r: PlayerRow): PlayerIdentity {
  return {
    id: r.id, name: r.name, nation: r.nation, team: r.team,
    role: r.role, subRole: r.sub_role, club: r.club,
    hasBaseline: r.has_baseline, tracked: r.tracked,
  };
}
/** Humanize a bare player_id into a display name for a stat-only player with NO players row at all
 *  (a guard: should not happen once auto-expand is reliable, but a real scorer must never be dropped).
 *  "deniz_undav" / "deniz-undav" -> "Deniz Undav". Falls back to the raw id when it has no separators. */
function humanizeId(id: string): string {
  const parts = id.split(/[_\-\s]+/).filter(Boolean);
  if (parts.length === 0) return id;
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join(" ");
}
/** A minimal identity synthesized from a player_id that has stats but NO players row. Surfaces the
 *  scorer with the best identity available rather than dropping it; unknown identity fields default to
 *  the empty/null shape (nation "", no team/role/club, untracked, no baseline). */
function syntheticIdentity(id: string): PlayerIdentity {
  return {
    id, name: humanizeId(id), nation: "", team: null,
    role: null, subRole: null, club: null,
    hasBaseline: false, tracked: false,
  };
}
function toProjection(r: ProjectionRow): PlayerProjection {
  return {
    metric: r.metric, expectedValue: r.expected_value,
    bandLow: r.band_low, bandHigh: r.band_high,
  };
}
/** Coerce the players.percentiles jsonb to Record<string, number> | null. supabase-js returns jsonb
 *  already parsed (object), but tolerate a string (text fallback) too. */
function parsePercentiles(raw: Record<string, number> | string | null): Record<string, number> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try { return JSON.parse(raw) as Record<string, number>; } catch { return null; }
  }
  return raw;
}
function toMatchStat(r: MatchStatRow): PlayerMatchStat {
  return {
    matchId: r.match_id, minutes: r.minutes, goals: r.goals, assists: r.assists, shots: r.shots,
    xg: r.xg, xa: r.xa, passes: r.passes, passCompletion: r.pass_completion,
    keyPasses: r.key_passes, progressivePasses: r.progressive_passes, duelsWon: r.duels_won,
    saves: r.saves, goalsConceded: r.goals_conceded, cleanSheet: r.clean_sheet,
    yellow: r.yellow, red: r.red, source: r.source, locked: r.locked,
  };
}

// ---- getPlayersIndex -----------------------------------------------------------------------------

/** The players index UNIVERSE = every tracked player UNION every player_id present in
 *  player_match_stats, each with their headline projection + accumulated actuals, ready for the index
 *  to filter/sort by role, nation, or over/under-performance. A scorer is NEVER silently dropped: a
 *  player with match stats but tracked=false (or absent from the players rows entirely) STILL appears.
 *  This mirrors the actuals-first award boards (getAwardRaces) at the read layer so the LIST and the
 *  boards can never disagree. Fail-soft to []. */
export function getPlayersIndex(): Promise<PlayerIndexRow[]> {
  return cachedRead("players-index", [TAGS.players, TAGS.run], _getPlayersIndexUncached);
}

async function _getPlayersIndexUncached(): Promise<PlayerIndexRow[]> {
  try {
    const sb = publicClient();
    // PAGINATE all three reads (selectAll loops .range until a short page): players (897) and
    // player_projections (755) are growth-prone and player_match_stats (1418 live) ALREADY exceeds
    // PostgREST's 1000-row cap, so a plain full-table select would silently truncate it and the board
    // would aggregate only the first 1000 rows. selectAll fails soft to [] exactly like the old reads.
    const [players, projRows, stats] = await Promise.all([
      // Fetch ALL players rows (tracked or not) so a stat-only player's identity resolves from its
      // players row when present; the tracked filter is reapplied below as part of the universe rule.
      selectAll<PlayerRow>(sb, "players", "*"),
      selectAll<ProjectionRow>(sb, "player_projections", PROJECTION_COLS),
      selectAll<Partial<MatchStatRow>>(sb, "player_match_stats", "player_id, goals, assists, clean_sheet, goals_conceded, saves, xg, xa"),
    ]);
    // READ GUARD: keep only the latest complete generation (max computed_at), never empty while one
    // exists. The finishing_factor metric is excluded from the index (it is not a headline metric).
    const projections = selectLatestGeneration(projRows);

    // projection lookup: player_id -> metric -> expected_value
    const projByPlayer = new Map<string, Map<string, number | null>>();
    for (const p of projections) {
      let m = projByPlayer.get(p.player_id);
      if (!m) { m = new Map(); projByPlayer.set(p.player_id, m); }
      m.set(p.metric, p.expected_value);
    }
    // actuals accumulation per player. Beyond goals/assists/clean_sheet we now also sum goals_conceded
    // + saves so the GK/DF tabs can lead with their real defensive output (the read still routes through
    // selectAll, so the growth-prone player_match_stats table is never truncated past 1000 rows).
    // xgSum/xaSum accumulate the AS-PLAYED expected goals/assists (sum of per-match xg/xa); hasXg/hasXa
    // record whether ANY logged match carried a value, so "no xg data at all" (-> null, DASH) stays
    // distinguishable from a genuine 0.0. These freeze an eliminated player's "now" to his played value.
    const actualByPlayer = new Map<string, {
      goals: number; assists: number; cleanSheet: number;
      goalsConceded: number; saves: number; matches: number;
      xgSum: number; xaSum: number; hasXg: boolean; hasXa: boolean;
    }>();
    for (const s of stats) {
      const pid = s.player_id as string;
      const a = actualByPlayer.get(pid) ??
        { goals: 0, assists: 0, cleanSheet: 0, goalsConceded: 0, saves: 0, matches: 0,
          xgSum: 0, xaSum: 0, hasXg: false, hasXa: false };
      a.goals += s.goals ?? 0;
      a.assists += s.assists ?? 0;
      a.cleanSheet += s.clean_sheet ? 1 : 0;
      a.goalsConceded += s.goals_conceded ?? 0;
      a.saves += s.saves ?? 0;
      if (typeof s.xg === "number") { a.xgSum += s.xg; a.hasXg = true; }
      if (typeof s.xa === "number") { a.xaSum += s.xa; a.hasXa = true; }
      a.matches += 1;
      actualByPlayer.set(pid, a);
    }

    // UNIVERSE = tracked players UNION every player_id present in player_match_stats, deduped by id.
    // Identity resolves from the players row when present (tracked OR not); a stat-only player_id with
    // NO players row at all is surfaced with a synthesized minimal identity rather than dropped (the
    // guard for an unreliable auto-expand). A non-tracked player with NO stats is NOT included (only
    // tracked OR has-stats). Built into an id-keyed map so the same player can never appear twice.
    const byId = new Map<string, PlayerIdentity>();
    for (const p of players) {
      if (p.tracked) byId.set(p.id, toIdentity(p));
    }
    const playerRowById = new Map<string, PlayerRow>(players.map((p) => [p.id, p]));
    for (const pid of actualByPlayer.keys()) {
      if (byId.has(pid)) continue; // already in (a tracked player who also has stats) -> no duplicate
      const row = playerRowById.get(pid);
      byId.set(pid, row ? toIdentity(row) : syntheticIdentity(pid));
    }
    // Deterministic SSR ordering: sort the universe by id (the index page re-sorts client-side, but a
    // stable construction order keeps two builds byte-identical).
    const universe = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));

    return universe.map((id) => {
      const proj = projByPlayer.get(id.id);
      const headlineMetric = (id.role && HEADLINE_BY_ROLE[id.role]) ?? null;
      const headlineExpected = headlineMetric ? proj?.get(headlineMetric) ?? null : null;
      const acc = actualByPlayer.get(id.id);
      const actualCol = headlineMetric ? ACTUAL_COLUMN[headlineMetric] : undefined;
      let headlineActual = 0;
      if (acc && actualCol === "goals") headlineActual = acc.goals;
      else if (acc && actualCol === "assists") headlineActual = acc.assists;
      else if (acc && actualCol === "cleanSheet") headlineActual = acc.cleanSheet;
      const performanceDelta = headlineExpected != null ? headlineActual - headlineExpected : null;

      // Strongest-actual DISPLAY: surface goals/assists explicitly (additive) and pick the metric the
      // player has actually produced, paired with its MATCHING expected so the tier never compares
      // goals to expected assists. Expected stays null when unprojected (no fabrication).
      const expectedGoals = proj?.get("expected_goals") ?? null;
      const expectedAssists = proj?.get("expected_assists") ?? null;
      const actualGoals = acc?.goals ?? 0;
      const actualAssists = acc?.assists ?? 0;
      // Keeper/defender actual + projection columns. clean sheets are a count of clean_sheet=true rows;
      // goals_conceded + saves are running sums; the two projections are the defensive-value
      // (expected_clean_sheets) and shot-stopping (expected_goals_prevented) metrics the GK/DF tabs lead.
      const actualCleanSheets = acc?.cleanSheet ?? 0;
      const actualGoalsConceded = acc?.goalsConceded ?? 0;
      const actualSaves = acc?.saves ?? 0;
      const expectedCleanSheets = proj?.get("expected_clean_sheets") ?? null;
      const expectedGoalsPrevented = proj?.get("expected_goals_prevented") ?? null;
      const strongest = strongestContribution(
        acc, expectedGoals, expectedAssists, headlineMetric, headlineExpected, headlineActual,
      );

      // statsbomb id resolves from the player's own row (null for a synthetic/actuals-only identity);
      // it is the exact-integer join key the frozen pre-tournament bundle prefers.
      const statsbombId = playerRowById.get(id.id)?.statsbomb_player_id ?? null;

      return {
        ...id,
        statsbombId,
        headlineMetric,
        headlineExpected,
        headlineActual,
        actualGoals,
        expectedGoals,
        actualAssists,
        expectedAssists,
        asPlayedXg: acc?.hasXg ? acc.xgSum : null,
        asPlayedXa: acc?.hasXa ? acc.xaSum : null,
        actualCleanSheets,
        actualGoalsConceded,
        actualSaves,
        expectedCleanSheets,
        expectedGoalsPrevented,
        displayMetric: strongest.metric,
        displayActual: strongest.actual,
        displayExpected: strongest.expected,
        matchesLogged: acc?.matches ?? 0,
        performanceDelta,
      };
    });
  } catch (err) {
    console.error("Failed to load players index from Supabase:", err);
    return [];
  }
}

// ---- getTeamPlayers (cross-link: a team's tracked players for /teams/[id]) ------------------------

/** One tracked player of a team, for the team page's "Key players" cross-link section. */
export interface TeamPlayerLink {
  id: string;
  name: string;
  nation: string;
  role: string | null;
  headlineMetric: string | null;
  headlineExpected: number | null;
}

/** The tracked players for one team (by canonical team name), each with their role headline
 *  projection, ordered by headline value desc so the strongest contributors lead. Fail-soft to [].
 *  Used by the /teams/[id] profile to link across to the players feature. */
export function getTeamPlayers(team: string): Promise<TeamPlayerLink[]> {
  return cachedRead(`team-players:${team}`, [TAGS.players, TAGS.run], () =>
    _getTeamPlayersUncached(team));
}

async function _getTeamPlayersUncached(team: string): Promise<TeamPlayerLink[]> {
  try {
    const sb = publicClient();
    const { data: pl, error } = await sb
      .from("players").select("*").eq("tracked", true).eq("team", team);
    if (error) throw error;
    const players = (pl ?? []) as PlayerRow[];
    if (players.length === 0) return [];

    const ids = players.map((p) => p.id);
    const { data: pr } = await sb
      .from("player_projections")
      .select(PROJECTION_COLS)
      .in("player_id", ids);
    // READ GUARD: latest complete generation only (this `in` filter on a team's players is itself a
    // complete subset across the two coexisting generations, so max-computed_at still resolves it).
    const projections = selectLatestGeneration((pr ?? []) as ProjectionRow[]);
    const byPlayer = new Map<string, Map<string, number | null>>();
    for (const p of projections) {
      let m = byPlayer.get(p.player_id);
      if (!m) { m = new Map(); byPlayer.set(p.player_id, m); }
      m.set(p.metric, p.expected_value);
    }

    return players
      .map((p): TeamPlayerLink => {
        const headlineMetric = (p.role && HEADLINE_BY_ROLE[p.role]) ?? null;
        const headlineExpected = headlineMetric
          ? byPlayer.get(p.id)?.get(headlineMetric) ?? null
          : null;
        return {
          id: p.id, name: p.name, nation: p.nation, role: p.role,
          headlineMetric, headlineExpected,
        };
      })
      .sort((a, b) => (b.headlineExpected ?? -Infinity) - (a.headlineExpected ?? -Infinity) ||
        a.name.localeCompare(b.name));
  } catch (err) {
    console.error(`Failed to load team players for "${team}":`, err);
    return [];
  }
}

// ---- getPlayerProfile ----------------------------------------------------------------------------

/** One player's full profile: identity + all projection metrics + the per-match stats log +
 *  positional-percentile context (from players.percentiles). Returns null when the player isn't
 *  found. Fail-soft. */
export function getPlayerProfile(id: string): Promise<PlayerProfile | null> {
  return cachedRead(`player-profile:${id}`, [TAGS.players, TAGS.run], () =>
    _getPlayerProfileUncached(id));
}

async function _getPlayerProfileUncached(id: string): Promise<PlayerProfile | null> {
  try {
    const sb = publicClient();
    const { data: prow, error: pErr } = await sb.from("players").select("*").eq("id", id).limit(1);
    if (pErr) throw pErr;
    const player = (prow?.[0] as PlayerRow | undefined) ?? null;
    if (!player) return null;

    const [pr, ms] = await Promise.all([
      sb.from("player_projections").select(PROJECTION_COLS).eq("player_id", id),
      sb.from("player_match_stats").select("*").eq("player_id", id),
    ]);
    if (pr.error) throw pr.error;
    if (ms.error) throw ms.error;

    // READ GUARD: latest complete generation for this player only.
    const projRows = selectLatestGeneration((pr.data ?? []) as ProjectionRow[]);
    // metric -> row, for building the goal split + finishingFactor.
    const byMetric = new Map<string, ProjectionRow>(projRows.map((r) => [r.metric, r]));
    const val = (m: string): number | null => byMetric.get(m)?.expected_value ?? null;

    // PROFILE goal split: assemble the open-play / penalty / npxg breakdown + the headline goals band.
    const eg = byMetric.get("expected_goals");
    const goals: PlayerGoals | null = eg
      ? {
          expected: eg.expected_value,
          openPlay: val("expected_open_play_goals"),
          penalty: val("expected_penalty_goals"),
          npxg: val("expected_npxg"),
          bandLow: eg.band_low ?? null,
          bandHigh: eg.band_high ?? null,
        }
      : null;
    // finishingFactor ships as its own metric row (bands null); surface its value, null if absent.
    const finishingFactor = val(FINISHING_FACTOR_METRIC);

    // The raw projections[] list EXCLUDES finishing_factor (it is surfaced as finishingFactor only).
    const projections = projRows
      .filter((r) => r.metric !== FINISHING_FACTOR_METRIC)
      .map(toProjection);
    // All of a player's projection rows share the run that produced them; surface it for the
    // provenance footer (the model run the projections were computed against).
    const sourceRunId = projRows[0]?.source_run_id ?? null;
    const matchStats = ((ms.data ?? []) as MatchStatRow[])
      .map(toMatchStat)
      .sort((a, b) => a.matchId.localeCompare(b.matchId));

    return {
      player: toIdentity(player), projections, matchStats,
      percentileContext: parsePercentiles(player.percentiles),
      sourceRunId, goals, finishingFactor,
    };
  } catch (err) {
    console.error(`Failed to load player profile ${id} from Supabase:`, err);
    return null;
  }
}

// ---- getAwardRaces -------------------------------------------------------------------------------

// Each board is ranked by the Phase 2 model's composite score, persisted as one award_* projection
// metric (see db/load_player_projections.py). We surface the model's boards verbatim - no SQL/TS
// re-derivation (golden_glove/award_potm are composites that can't be rebuilt from a single metric).
const AWARD_METRIC = {
  goldenBoot: "award_golden_boot",
  playmaker: "award_playmaker",
  goldenGlove: "award_golden_glove",
  potm: "award_potm",
} as const;

// The model's honest framing for POTM: it's the current pick, not a prophecy. Mirrors the artifact's
// award_leaderboards.player_of_the_tournament._flag so the UI can show the same caveat.
const POTM_CAVEAT =
  "The model's current pick, NOT a prophecy: POTM blends a cross-role contribution percentile with " +
  "team success (champion + deep-run probability) and is the noisiest, least reliable leaderboard.";

/** The four award leaderboards (golden boot / playmaker / golden glove / player of the tournament),
 *  each ranked by the model's composite award_* metric in player_projections, joined to players.
 *  Fail-soft to empty leaderboards. */
export function getAwardRaces(): Promise<AwardRaces> {
  return cachedRead("award-races", [TAGS.players, TAGS.run], _getAwardRacesUncached);
}

async function _getAwardRacesUncached(): Promise<AwardRaces> {
  const empty: AwardRaces = {
    goldenBoot: [], playmaker: [], goldenGlove: [], potm: [],
    potmNoisy: true, potmCaveat: POTM_CAVEAT,
  };
  try {
    const sb = publicClient();
    // PAGINATE all three reads (selectAll loops .range until a short page): players + projections are
    // growth-prone and player_match_stats ALREADY exceeds PostgREST's 1000-row cap, so a plain
    // full-table select would silently truncate the actuals universe and a scorer beyond row 1000
    // (e.g. Ronaldo) would vanish from the boards entirely. selectAll fails soft to [] like the old reads.
    const [playerRows, projRows, statRows] = await Promise.all([
      selectAll<PlayerRow>(sb, "players", "id, name, nation, team, role, club"),
      selectAll<ProjectionRow>(sb, "player_projections", PROJECTION_COLS),
      selectAll<Partial<MatchStatRow>>(sb, "player_match_stats", "player_id, goals, assists, minutes"),
    ]);

    const idMap = new Map<string, PlayerRow>(playerRows.map((p) => [p.id, p]));
    // READ GUARD: latest complete generation only. Boards read only award_*/headline metrics, so
    // finishing_factor never appears as a board entry.
    const projections = selectLatestGeneration(projRows);

    // index per player -> metric -> expected_value (for the role headline we attach for context)
    const expByPlayer = new Map<string, Map<string, number | null>>();
    for (const p of projections) {
      let m = expByPlayer.get(p.player_id);
      if (!m) { m = new Map(); expByPlayer.set(p.player_id, m); }
      m.set(p.metric, p.expected_value);
    }

    // ACTUALS accumulation per player: running goals + assists (same shape getPlayersIndex sums),
    // plus total MINUTES for the official Golden Boot tiebreak. Lets the actuals-first boards
    // (goldenBoot, playmaker) rank cross-role scorers by what has actually happened, so a 3-goal MF
    // leads a 2-goal FW with higher expected. `minutes` stays null until at least ONE row carries a
    // non-null minutes value (a null/absent row contributes 0 to the sum but does NOT count as
    // minutes data), so "no minutes data at all" is distinguishable from "0 minutes". Fail-soft to {}.
    const actualByPlayer = new Map<string, { goals: number; assists: number; minutes: number | null }>();
    for (const s of statRows) {
      const pid = s.player_id as string;
      const a = actualByPlayer.get(pid) ?? { goals: 0, assists: 0, minutes: null };
      a.goals += s.goals ?? 0;
      a.assists += s.assists ?? 0;
      if (s.minutes != null) a.minutes = (a.minutes ?? 0) + s.minutes;
      actualByPlayer.set(pid, a);
    }

    // Build one board entry. `actualOf` selects which accumulated total this board ranks on (goals for
    // goldenBoot, assists for playmaker); pass undefined for boards that do not surface an actual.
    const entry = (
      p: ProjectionRow,
      actualOf?: (a: { goals: number; assists: number }) => number,
    ): AwardRaceEntry | null => {
      const meta = idMap.get(p.player_id);
      if (!meta) return null;
      const headlineMetric = (meta.role && HEADLINE_BY_ROLE[meta.role]) ?? null;
      const headlineExpected = headlineMetric
        ? expByPlayer.get(p.player_id)?.get(headlineMetric) ?? null
        : null;
      const acc = actualByPlayer.get(p.player_id);
      const actual = actualOf ? actualOf(acc ?? { goals: 0, assists: 0 }) : undefined;
      return {
        playerId: p.player_id, name: meta.name, nation: meta.nation, team: meta.team,
        role: meta.role, club: meta.club,
        expectedValue: p.expected_value, bandLow: p.band_low, bandHigh: p.band_high,
        headlineMetric, headlineExpected,
        ...(actual !== undefined ? { actual } : {}),
      };
    };

    // Rank a board by its award_* composite metric, expected_value desc, top N. (glove/potm/position
    // shape + ordering unchanged.)
    const board = (metric: string): AwardRaceEntry[] =>
      projections
        .filter((p) => p.metric === metric && p.expected_value != null)
        .sort((a, b) => (b.expected_value ?? 0) - (a.expected_value ?? 0))
        .map((p) => entry(p))
        .filter((e): e is AwardRaceEntry => e !== null)
        .slice(0, LEADERBOARD_SIZE);

    // Index every latest-generation projection row by (player, metric) so a scorer's expected_value
    // + bands can be LEFT-JOINED onto the actuals universe below (null when the player has no
    // projection row of that metric -- the card dashes it).
    const projByPlayerMetric = new Map<string, Map<string, ProjectionRow>>();
    for (const p of projections) {
      let m = projByPlayerMetric.get(p.player_id);
      if (!m) { m = new Map(); projByPlayerMetric.set(p.player_id, m); }
      m.set(p.metric, p);
    }

    // expected_value DESC with NULLS LAST: at equal actuals a projected scorer outranks an unprojected
    // one; two unprojected scorers fall through to the name/id tiebreak. NaN-free (no Infinity math).
    const byExpectedDescNullsLast = (a: AwardRaceEntry, b: AwardRaceEntry): number => {
      const av = a.expectedValue;
      const bv = b.expectedValue;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
    };

    // OFFICIAL Golden Boot tiebreak beyond goals (FIFA's published award criteria, DISPLAY-ORDER
    // ONLY -- the model's composites are untouched): more assists first, then FEWEST total minutes
    // played first. A player with NO minutes data at all (every row null/absent) sorts AFTER a
    // same-goals-same-assists player who has minutes -- we cannot honestly claim "fewest" for an
    // unknown total. Used by the goldenBoot chain only; playmaker never enters this comparator.
    const byOfficialBootTiebreak = (a: AwardRaceEntry, b: AwardRaceEntry): number => {
      const aa = actualByPlayer.get(a.playerId);
      const ba = actualByPlayer.get(b.playerId);
      const byAssists = (ba?.assists ?? 0) - (aa?.assists ?? 0);
      if (byAssists !== 0) return byAssists;
      const am = aa?.minutes ?? null;
      const bm = ba?.minutes ?? null;
      if (am == null && bm == null) return 0;
      if (am == null) return 1;
      if (bm == null) return -1;
      return am - bm; // fewest minutes first
    };

    // An ACTUAL-CONTRIBUTORS board (goldenBoot, playmaker). The UNIVERSE is EVERY player with a real
    // running total > 0 of the board's actual metric (goals for goldenBoot, assists for playmaker) in
    // player_match_stats -- NOT just the model's projection pool -- so a genuine scorer with no
    // projection row (e.g. an unprojected squad player) is still surfaced as a current contributor.
    // Each entry LEFT-JOINs its expected_value + bands from the latest complete generation of the
    // matching projection metric (null -> the card dashes the expected). Identity (name / nation /
    // flag) comes from the players table join; a scorer with no players row is SKIPPED (never a
    // null/NaN entry). Sort: actual desc, then the board's `tiebreak` (goldenBoot passes the OFFICIAL
    // FIFA chain above -- assists desc, fewest minutes asc; playmaker passes none), then expected
    // desc (nulls last), then name asc, then playerId asc -- the model's expected is a LOWER-priority
    // tiebreak than the official criteria, and the tail stays fully deterministic regardless of DB
    // row order. A 0-actual high-expected player is excluded; when nobody has contributed the board
    // is empty (honest empty state). Both the /players award cards AND the home card consume this
    // order verbatim, so the two surfaces AGREE.
    const actualsFirstBoard = (
      metric: string,
      actualOf: (a: { goals: number; assists: number }) => number,
      tiebreak?: (a: AwardRaceEntry, b: AwardRaceEntry) => number,
    ): AwardRaceEntry[] => {
      const out: AwardRaceEntry[] = [];
      for (const [pid, acc] of actualByPlayer) {
        const actual = actualOf(acc);
        if (actual <= 0) continue;
        const meta = idMap.get(pid);
        if (!meta) continue; // no identity row -> skip (never render a null/NaN entry)
        const proj = projByPlayerMetric.get(pid)?.get(metric) ?? null;
        const headlineMetric = (meta.role && HEADLINE_BY_ROLE[meta.role]) ?? null;
        const headlineExpected = headlineMetric
          ? expByPlayer.get(pid)?.get(headlineMetric) ?? null
          : null;
        out.push({
          playerId: pid, name: meta.name, nation: meta.nation, team: meta.team,
          role: meta.role, club: meta.club,
          expectedValue: proj?.expected_value ?? null,
          bandLow: proj?.band_low ?? null,
          bandHigh: proj?.band_high ?? null,
          headlineMetric, headlineExpected,
          actual,
        });
      }
      out.sort(
        (a, b) =>
          (b.actual ?? 0) - (a.actual ?? 0) ||
          (tiebreak ? tiebreak(a, b) : 0) ||
          byExpectedDescNullsLast(a, b) ||
          a.name.localeCompare(b.name) ||
          a.playerId.localeCompare(b.playerId),
      );
      return out.slice(0, LEADERBOARD_SIZE);
    };

    // The model's PRE-TOURNAMENT favourite for an award = the player with the highest expected value for
    // that award metric across ALL projected players (NOT just the scorers on the actuals board). So the
    // verdict compares the real winner to who the model actually picked, never to the best on-board scorer.
    const favouriteFor = (metric: string): AwardVerdict["pick"] | null => {
      let best: { pid: string; val: number } | null = null;
      for (const [pid, byMetric] of projByPlayerMetric) {
        const v = byMetric.get(metric)?.expected_value;
        if (v == null) continue;
        if (!best || v > best.val) best = { pid, val: v };
      }
      const meta = best ? idMap.get(best.pid) : null;
      return best && meta ? { playerId: best.pid, name: meta.name, nation: meta.nation, role: meta.role } : null;
    };
    // hit iff the model's favourite is also the actual winner (board rank 1). Null when either is absent.
    const verdictFor = (b: AwardRaceEntry[], metric: string): AwardVerdict | null => {
      const pick = favouriteFor(metric);
      const winner = b[0];
      if (!pick || !winner) return null;
      return { pick, hit: pick.playerId === winner.playerId };
    };

    // goldenBoot DISPLAYS the official FIFA Golden Boot tiebreak (goals desc, assists desc, fewest
    // minutes asc) before the deterministic expected/name/id tail; playmaker keeps its original
    // actual-assists desc -> expected -> name -> id order (no official-chain leak).
    const goldenBoot = actualsFirstBoard(AWARD_METRIC.goldenBoot, (a) => a.goals, byOfficialBootTiebreak);
    const playmaker = actualsFirstBoard(AWARD_METRIC.playmaker, (a) => a.assists);
    return {
      goldenBoot,
      playmaker,
      goldenGlove: board(AWARD_METRIC.goldenGlove),
      potm: board(AWARD_METRIC.potm),
      potmNoisy: true,
      potmCaveat: POTM_CAVEAT,
      goldenBootVerdict: verdictFor(goldenBoot, AWARD_METRIC.goldenBoot),
      playmakerVerdict: verdictFor(playmaker, AWARD_METRIC.playmaker),
    };
  } catch (err) {
    console.error("Failed to load award races from Supabase:", err);
    return empty;
  }
}

// ---- getPositionLeaders (A7: best at each position) ----------------------------------------------

// The four per-position boards persisted by db/load_player_projections.py. Each ranks by the model's
// role-appropriate overall rating (role headline expected blended with role key percentiles), stamped
// under its own position_best_<role> metric - surfaced verbatim, no SQL/TS re-derivation.
const POSITION_METRIC = {
  gk: "position_best_gk",
  df: "position_best_df",
  mf: "position_best_mf",
  fw: "position_best_fw",
} as const;

const POSITION_BOARD_SIZE = 5;

/** The four "best at each position" boards (best GK / DF / MF / FW), each ranked by the model's
 *  role overall rating (the position_best_<role> metric in player_projections), joined to players.
 *  Fail-soft to empty boards. */
export function getPositionLeaders(): Promise<PositionLeaders> {
  return cachedRead("position-leaders", [TAGS.players, TAGS.run], _getPositionLeadersUncached);
}

async function _getPositionLeadersUncached(): Promise<PositionLeaders> {
  const empty: PositionLeaders = { gk: [], df: [], mf: [], fw: [] };
  try {
    const sb = publicClient();
    // PAGINATE both reads: players + player_projections are growth-prone, so a plain full-table select
    // would silently truncate past PostgREST's 1000-row cap and drop the strongest projection for a
    // position board. selectAll fails soft to [] like the old reads.
    const [playerRows, projRows] = await Promise.all([
      selectAll<PlayerRow>(sb, "players", "id, name, nation, team, role, club"),
      selectAll<ProjectionRow>(sb, "player_projections", PROJECTION_COLS),
    ]);

    const idMap = new Map<string, PlayerRow>(playerRows.map((p) => [p.id, p]));
    // READ GUARD: latest complete generation only.
    const projections = selectLatestGeneration(projRows);

    const expByPlayer = new Map<string, Map<string, number | null>>();
    for (const p of projections) {
      let m = expByPlayer.get(p.player_id);
      if (!m) { m = new Map(); expByPlayer.set(p.player_id, m); }
      m.set(p.metric, p.expected_value);
    }

    const entry = (p: ProjectionRow): AwardRaceEntry | null => {
      const meta = idMap.get(p.player_id);
      if (!meta) return null;
      const headlineMetric = (meta.role && HEADLINE_BY_ROLE[meta.role]) ?? null;
      const headlineExpected = headlineMetric
        ? expByPlayer.get(p.player_id)?.get(headlineMetric) ?? null
        : null;
      return {
        playerId: p.player_id, name: meta.name, nation: meta.nation, team: meta.team,
        role: meta.role, club: meta.club,
        expectedValue: p.expected_value, bandLow: p.band_low, bandHigh: p.band_high,
        headlineMetric, headlineExpected,
      };
    };

    const board = (metric: string): AwardRaceEntry[] =>
      projections
        .filter((p) => p.metric === metric && p.expected_value != null)
        .sort((a, b) => (b.expected_value ?? 0) - (a.expected_value ?? 0))
        .map(entry)
        .filter((e): e is AwardRaceEntry => e !== null)
        .slice(0, POSITION_BOARD_SIZE);

    return {
      gk: board(POSITION_METRIC.gk),
      df: board(POSITION_METRIC.df),
      mf: board(POSITION_METRIC.mf),
      fw: board(POSITION_METRIC.fw),
    };
  } catch (err) {
    console.error("Failed to load position leaders from Supabase:", err);
    return empty;
  }
}

// ---- getProjectionMeta (freshness data contract) -------------------------------------------------

/** The {asOfDate, runId, condLabel} contract for the CURRENTLY-DISPLAYED projection generation: the
 *  latest complete generation by computed_at, its source_run_id, the condN label parsed from the
 *  run_id (null for a base run), and an as-of parsed from the run_id (falling back to computed_at).
 *  Fail-soft to null (no rows / DB error). */
export function getProjectionMeta(): Promise<ProjectionMeta | null> {
  return cachedRead("projection-meta", [TAGS.players, TAGS.run], _getProjectionMetaUncached);
}

async function _getProjectionMetaUncached(): Promise<ProjectionMeta | null> {
  try {
    const sb = publicClient();
    // PAGINATE: player_projections is growth-prone, so a plain full-table select would silently
    // truncate past PostgREST's 1000-row cap and could drop the latest generation's rows, freezing the
    // freshness contract. selectAll fails soft to [] like the old read.
    const rows = await selectAll<ProjectionRow>(sb, "player_projections", "metric, computed_at, source_run_id");
    return projectionMetaFromRows(rows);
  } catch (err) {
    console.error("Failed to load projection meta from Supabase:", err);
    return null;
  }
}
