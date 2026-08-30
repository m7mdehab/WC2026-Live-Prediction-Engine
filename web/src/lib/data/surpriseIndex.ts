// Sticky surprise index (Wave 4) - PURE, unit-testable assembler.
//
// The metric is pre-registered in docs/surprise-index-definition.md; this module is the exact
// implementation of that document. It is deliberately IO-free (no server-only, no supabase import)
// so it runs under bare Node / jiti in the unit tests, exactly like the pure engine in
// lib/data/groups.ts. All facts that describe what a team DID come from RESULTS; a probability is
// only ever consulted to PRICE how improbable a reached stage was, never to decide who is in or out.
//
// Surprise index per team = a weighted, min-max-normalized blend of:
//   (a) STAGE SURPRISE  = -ln( clamp(frozen cond0 p0 of the DEEPEST STAGE ACTUALLY REACHED) )
//   (b) MATCH SURPRISE  = mean over played matches of ( achieved points - pre-kickoff expected points )
//
// ELIGIBILITY GATE (council decision). The surprise MATH is unchanged; what the gate changes is the
// POPULATION each card ranks over. A FROZEN elite tier -- the pre-tournament top ELITE_TIER_SIZE teams
// by cond0 champion odds, under a deterministic total order -- splits the field once and never flexes
// as teams are eliminated:
//   Dark horses  = the top 5 by surprise index drawn ONLY from OUTSIDE the elite tier (an unfancied
//                  side beating its odds), and only where the surprise index is > 0. A pre-tournament
//                  top-12 favourite is NEVER a dark horse, however far it runs. STICKY: an eliminated
//                  over-performer stays ranked.
//   Overvalued   = the mirror (FIFA-rank percentile minus ACHIEVED-outcome percentile) drawn ONLY from
//                  INSIDE the elite tier: a favourite that fell short. A low-rated early-exit team is
//                  never overvalued. Never-empty fallback slides the eligibility boundary to
//                  best-available within the frozen tier rather than blanking.

// ---------------------------------------------------------------------------------------------------
// Stage ladder (deepest last). Depth is the index in this array.
// ---------------------------------------------------------------------------------------------------
export const STAGE_LADDER = [
  "group",
  "round_of_32",
  "round_of_16",
  "quarter_finals",
  "semi_finals",
  "final",
  "champion",
] as const;
export type StageLevel = (typeof STAGE_LADDER)[number];

/** Depth of a stage on the ladder (group = 0 ... champion = 6). */
export function stageDepth(s: StageLevel): number {
  return STAGE_LADDER.indexOf(s);
}

/** Short human label for a deepest stage reached (card display; no em-dash). */
export const STAGE_LABEL: Record<StageLevel, string> = {
  group: "Group stage",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_finals: "Quarter-finals",
  semi_finals: "Semi-finals",
  final: "Final",
  champion: "Champion",
};

/** Frozen cond0 stage probabilities for one team (mirrors team_probabilities columns). */
export interface Cond0StageProbs {
  advance_group: number | null;
  reach_r16: number | null;
  reach_qf: number | null;
  reach_sf: number | null;
  reach_final: number | null;
  champion: number | null;
}

/** Which cond0 probability column prices each deepest stage. `group` is implicitly 1.0 (certain),
 *  so it maps to null and contributes zero surprise. */
const STAGE_P0_FIELD: Record<StageLevel, keyof Cond0StageProbs | null> = {
  group: null,
  round_of_32: "advance_group",
  round_of_16: "reach_r16",
  quarter_finals: "reach_qf",
  semi_finals: "reach_sf",
  final: "reach_final",
  champion: "champion",
};

/** Winning a match at KEY means the team REACHED the VALUE stage (played the next round). */
const WIN_ADVANCES: Record<string, StageLevel> = {
  round_of_32: "round_of_16",
  round_of_16: "quarter_finals",
  quarter_finals: "semi_finals",
  semi_finals: "final",
  final: "champion",
};

// ---------------------------------------------------------------------------------------------------
// Scoring constants (documented in docs/surprise-index-definition.md; a change here is a metric change).
// ---------------------------------------------------------------------------------------------------
export const SURPRISE_WEIGHTS = { stage: 0.6, match: 0.4 } as const;
// Small positive clamp so a stage the frozen run gave EXACTLY 0 yields a large-but-finite surprise
// rather than infinity/NaN. It never decides in/out (that is a result fact) and never zeroes a
// still-alive longshot. Safely below the 1/50000 Monte-Carlo resolution.
export const P_FLOOR = 1e-4;
const SECTION_SIZE = 5;
// Overvalued eligibility: an ELITE team's FIFA pedigree must beat its achievement by at least this
// margin before we flag it (a real, not marginal, under-delivery). The old FIFA-percentile floor is
// gone: elite membership (the top ELITE_TIER_SIZE by cond0 champion odds) is a stronger "highly ranked"
// test than a FIFA-rank percentile, and it is what the gate now uses to define the pool.
const OVERVALUED_MIN_GAP = 0.04;

// ELIGIBILITY GATE constants (council decision; see the module header). The elite tier is the
// pre-tournament top ELITE_TIER_SIZE by FROZEN cond0 champion odds; dark horses come only from OUTSIDE
// it, overvalued only from INSIDE it.
/** The elite tier size: the pre-tournament top N by frozen cond0 champion odds. */
export const ELITE_TIER_SIZE = 12;
/** Never-empty floor: a card slides its eligibility boundary toward best-available until it holds at
 *  least this many (or, honestly, shows what little the tournament has actually produced). */
const MIN_CARD_FILL = 3;

// ---------------------------------------------------------------------------------------------------
// Deepest stage ACTUALLY reached (pure; from results, never from a probability).
// ---------------------------------------------------------------------------------------------------

/** Compute each team's deepest stage reached from the actual results.
 *  - allTeams: the full field (all reach the group stage).
 *  - qualifiedR32: teams that qualified from their group by completed results (top 2 + best 8 thirds).
 *  - koWinnersByStage: stage -> set of teams that WON a completed match at that stage (winner_team).
 *  A team that qualified reached round_of_32; a team that won at stage S reached the next stage. The
 *  third_place_playoff never advances depth (its teams are semi-final losers, already at semi_finals). */
export function computeDeepestStages(
  allTeams: Iterable<string>,
  qualifiedR32: Iterable<string>,
  koWinnersByStage: Map<string, Set<string>>,
): Map<string, StageLevel> {
  const depth = new Map<string, number>();
  for (const t of allTeams) depth.set(t, 0); // everyone reaches the group stage
  const bump = (team: string, level: StageLevel) => {
    if (!depth.has(team)) depth.set(team, 0);
    const d = stageDepth(level);
    if ((depth.get(team) as number) < d) depth.set(team, d);
  };
  for (const t of qualifiedR32) bump(t, "round_of_32");
  for (const [stage, winners] of koWinnersByStage) {
    const adv = WIN_ADVANCES[stage];
    if (!adv) continue; // third_place_playoff / unknown stage: no depth change
    for (const w of winners) bump(w, adv);
  }
  const out = new Map<string, StageLevel>();
  for (const [team, d] of depth) out.set(team, STAGE_LADDER[d]);
  return out;
}

// ---------------------------------------------------------------------------------------------------
// The assembler.
// ---------------------------------------------------------------------------------------------------

/** One played match, team-oriented: points banked vs the pre-kickoff model expectation. */
export interface MatchOutcome {
  /** actual scoreline outcome for the team: win = 3, draw = 1, loss = 0. */
  achievedPoints: number;
  /** 3*pWin + 1*pDraw from the LAST retained run before kickoff, oriented to the team. */
  expectedPoints: number;
}

/** Everything the assembler needs about ONE team, all of it from results (+ static facts). */
export interface TeamResultsFacts {
  team: string;
  hostFlag: boolean;
  fifaRank: number | null;
  deepestStage: StageLevel;
  matches: MatchOutcome[];
}

/** A team's scored surprise. */
export interface TeamSurprise {
  team: string;
  hostFlag: boolean;
  fifaRank: number | null;
  deepestStage: StageLevel;
  deepestStageLabel: string;
  stageSurprise: number; // -ln(clamped p0) ; >= 0
  matchSurprise: number; // mean(achieved - expected) ; roughly [-3, 3]
  achievementScore: number; // absolute achievement (stage-dominant), for the overvalued mirror
  surpriseIndex: number; // weighted, normalized blend in [0,1]
}

/** An overvalued team = a strong FIFA pedigree the achieved outcome did not back. */
export interface OvervaluedTeam extends TeamSurprise {
  fifaPct: number; // FIFA-rank percentile across the field (1 = best)
  achievedPct: number; // achievement percentile across the field (1 = best)
  gap: number; // fifaPct - achievedPct (positive: pedigree above achievement)
}

export interface SurpriseResult {
  /** All teams scored (never filtered: the sticky field). */
  teams: TeamSurprise[];
  /** Top 5 by surprise index from OUTSIDE the elite tier (surprise > 0), sticky. */
  darkHorses: TeamSurprise[];
  /** Top 5 by fifaPct - achievedPct (the mirror) from INSIDE the elite tier. */
  overvalued: OvervaluedTeam[];
}

/** -ln(clamp(p0)) for the deepest stage. group -> 0. null / <=0 p0 -> clamped to P_FLOOR. */
function stageSurpriseOf(deepest: StageLevel, p0: Cond0StageProbs | undefined): number {
  const field = STAGE_P0_FIELD[deepest];
  if (field == null) return 0; // reaching the group stage is certain
  const raw = p0 ? p0[field] : null;
  const p = Math.max(P_FLOOR, raw != null && raw > 0 ? raw : 0);
  return -Math.log(p);
}

/** mean(achieved - expected) over played matches; 0 when no match was played. */
function matchSurpriseOf(matches: MatchOutcome[]): number {
  if (matches.length === 0) return 0;
  let s = 0;
  for (const m of matches) s += m.achievedPoints - m.expectedPoints;
  return s / matches.length;
}

/** Percentile of `value` within `values` in [0,1] (1 = best). `better(a,b)` is true when a ranks
 *  ahead of b. (# strictly better-than by value) / (n-1), matching lib/data/forecast.ts. */
function percentileOf(values: number[], value: number, better: (a: number, b: number) => boolean): number {
  const n = values.length;
  if (n <= 1) return 1;
  let worse = 0;
  for (const other of values) if (better(value, other)) worse++;
  return worse / (n - 1);
}

/** min-max normalize `x` across the field to [0,1]. A zero-range field maps everything to 0 (nothing
 *  to distinguish yet, e.g. pre-tournament). */
function minMax(x: number, min: number, max: number): number {
  if (max <= min) return 0;
  return (x - min) / (max - min);
}

// ---------------------------------------------------------------------------------------------------
// ELIGIBILITY GATE: the frozen elite tier (pre-tournament top ELITE_TIER_SIZE by cond0 champion odds).
// Pure and testable; depends only on cond0 pedigree + static FIFA/name, NEVER on results, so the tier
// is byte-identical pre-match-1 and post-final.
// ---------------------------------------------------------------------------------------------------

/** One team ranked by frozen cond0 pedigree. `champ` is the sentinel-coerced champion odds: a team with
 *  NULL or 0 cond0 champion odds is coerced to -1 (sorts to the very bottom) and marked not-positive,
 *  so it can never enter the elite tier. */
interface Cond0Rankable {
  team: string;
  champ: number;
  reachFinal: number;
  fifaRank: number;
  positive: boolean;
}

/** The whole field ordered by the DETERMINISTIC TOTAL ORDER (no shared ranks, highest pedigree first):
 *  champion odds DESC, then reach_final DESC, then FIFA rank ASC, then team name ASC. */
function cond0Rankables(facts: TeamResultsFacts[], cond0: Map<string, Cond0StageProbs>): Cond0Rankable[] {
  return facts
    .map((f) => {
      const p = cond0.get(f.team);
      const positive = !!p && p.champion != null && p.champion > 0;
      return {
        team: f.team,
        champ: positive ? (p!.champion as number) : -1,
        reachFinal: p && p.reach_final != null ? p.reach_final : -1,
        fifaRank: f.fifaRank != null ? f.fifaRank : Number.POSITIVE_INFINITY,
        positive,
      };
    })
    .sort(
      (a, b) =>
        b.champ - a.champ ||
        b.reachFinal - a.reachFinal ||
        a.fifaRank - b.fifaRank ||
        a.team.localeCompare(b.team),
    );
}

/** The full field in frozen cond0 pedigree order (highest first), as team names. Exported for the
 *  deterministic-total-order and null/0-champion tests. */
export function cond0PedigreeOrder(facts: TeamResultsFacts[], cond0: Map<string, Cond0StageProbs>): string[] {
  return cond0Rankables(facts, cond0).map((r) => r.team);
}

/** The FROZEN elite tier: the top ELITE_TIER_SIZE teams in cond0 pedigree order that carry a POSITIVE
 *  cond0 champion probability. A team with NULL or 0 champion odds is never included, even in a
 *  degenerate field with fewer than ELITE_TIER_SIZE positive-odds teams. Frozen against results. */
export function computeEliteTier(facts: TeamResultsFacts[], cond0: Map<string, Cond0StageProbs>): Set<string> {
  const ranked = cond0Rankables(facts, cond0);
  const elite = new Set<string>();
  for (let i = 0; i < ranked.length && i < ELITE_TIER_SIZE; i++) {
    if (ranked[i].positive) elite.add(ranked[i].team);
  }
  return elite;
}

/**
 * Score every team and build the two cards, PURELY. `facts` should be the full 48-team field (the
 * sticky invariant: all teams always present). `cond0` is the frozen pre-tournament p0 per team.
 * Deterministic: same inputs -> byte-identical output.
 */
export function assembleSurprise(
  facts: TeamResultsFacts[],
  cond0: Map<string, Cond0StageProbs>,
): SurpriseResult {
  // 1) raw components per team
  const raw = facts.map((f) => {
    const stageSurprise = stageSurpriseOf(f.deepestStage, cond0.get(f.team));
    const matchSurprise = matchSurpriseOf(f.matches);
    // absolute achievement: deepest stage dominates; total achieved points refine within a stage.
    const totalAchieved = f.matches.reduce((s, m) => s + m.achievedPoints, 0);
    const achievementScore = stageDepth(f.deepestStage) * 100 + totalAchieved;
    return { f, stageSurprise, matchSurprise, achievementScore };
  });

  // 2) min-max normalize each component across the fixed field, then blend.
  const stageVals = raw.map((r) => r.stageSurprise);
  const matchVals = raw.map((r) => r.matchSurprise);
  const sMin = Math.min(...stageVals), sMax = Math.max(...stageVals);
  const mMin = Math.min(...matchVals), mMax = Math.max(...matchVals);

  const teams: TeamSurprise[] = raw.map((r) => {
    const normStage = minMax(r.stageSurprise, sMin, sMax);
    const normMatch = minMax(r.matchSurprise, mMin, mMax);
    const surpriseIndex = SURPRISE_WEIGHTS.stage * normStage + SURPRISE_WEIGHTS.match * normMatch;
    return {
      team: r.f.team,
      hostFlag: r.f.hostFlag,
      fifaRank: r.f.fifaRank,
      deepestStage: r.f.deepestStage,
      deepestStageLabel: STAGE_LABEL[r.f.deepestStage],
      stageSurprise: r.stageSurprise,
      matchSurprise: r.matchSurprise,
      achievementScore: r.achievementScore,
      surpriseIndex,
    };
  });

  // 2.5) THE ELIGIBILITY GATE: split the field on the FROZEN elite tier (top ELITE_TIER_SIZE by cond0
  //      champion odds). It is computed once, from cond0 only, so it does not move as teams are knocked
  //      out. Dark horses come only from OUTSIDE it; overvalued only from INSIDE it. The two pools are
  //      exhaustive (every team is elite or not) and disjoint, so a team can appear on at most one card.
  const elite = computeEliteTier(facts, cond0);
  const isElite = (team: string) => elite.has(team);

  // 3) DARK HORSES: OUTSIDE the elite tier, genuine over-performance (surprise index > 0), top 5, sticky.
  //    A pre-tournament top-12 favourite is NEVER a dark horse, however deep it runs (the regression the
  //    gate fixes). surprise>0 is absolute and never relaxed, so before any team has out-run its frozen
  //    baseline the card is honestly empty. Ties -> deeper stage, then name.
  const darkHorses = teams
    .filter((t) => !isElite(t.team) && t.surpriseIndex > 0)
    .slice()
    .sort(
      (a, b) =>
        b.surpriseIndex - a.surpriseIndex ||
        stageDepth(b.deepestStage) - stageDepth(a.deepestStage) ||
        a.team.localeCompare(b.team),
    )
    .slice(0, SECTION_SIZE);

  // 4) OVERVALUED: INSIDE the elite tier, the mirror (fifaPct minus achievedPct), ranked by
  //    under-delivery. A low-rated early-exit team is never here (it is not elite). The percentile
  //    context stays the full field. Empty until results DIFFERENTIATE the field: before anyone has
  //    achieved anything, no favourite can have "fallen short" (mirrors the pre-tournament zero-index).
  const fifaVals = teams.map((t) => t.fifaRank).filter((r): r is number => r != null);
  const achievementVals = teams.map((t) => t.achievementScore);
  const achMin = Math.min(...achievementVals);
  const achMax = Math.max(...achievementVals);
  const fieldDifferentiated = achMax > achMin;

  const overvaluedPool: OvervaluedTeam[] = teams
    .filter((t) => isElite(t.team))
    .map((t) => {
      // a team with no FIFA rank cannot be "highly ranked", so its fifaPct is the floor (0).
      const fifaPct = t.fifaRank != null ? percentileOf(fifaVals, t.fifaRank, (a, b) => a < b) : 0;
      const achievedPct = percentileOf(achievementVals, t.achievementScore, (a, b) => a > b);
      return { ...t, fifaPct, achievedPct, gap: fifaPct - achievedPct };
    })
    // genuine under-delivery only: pedigree strictly above achievement (never flag a favourite that met
    // or beat its billing as "overvalued").
    .filter((t) => t.gap > 0)
    .sort((a, b) => b.gap - a.gap || b.fifaPct - a.fifaPct || a.team.localeCompare(b.team));

  // Primary eligibility: a real margin (gap >= OVERVALUED_MIN_GAP). NEVER-EMPTY fallback: if that yields
  // fewer than MIN_CARD_FILL, SLIDE the eligibility boundary down to best-available under-delivery within
  // the SAME frozen top-12 (keeps the "top 12 falling short" label true; never pulls in a non-elite
  // team, never invents an over-performer where the field is undifferentiated).
  let overvalued: OvervaluedTeam[] = [];
  if (fieldDifferentiated) {
    overvalued = overvaluedPool.filter((t) => t.gap >= OVERVALUED_MIN_GAP).slice(0, SECTION_SIZE);
    if (overvalued.length < MIN_CARD_FILL) overvalued = overvaluedPool.slice(0, SECTION_SIZE);
  }

  return { teams, darkHorses, overvalued };
}
