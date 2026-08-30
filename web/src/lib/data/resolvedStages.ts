// Resolved-stage badges for /forecast: for each team, for each stage in the ladder
// [advance_group, reach_qf, reach_sf, reach_final, champion], once that stage's outcome is RESOLVED by
// ACTUAL RESULTS show an achieved/failed verdict plus "was NN%" (the model's probability from the last
// retained run where the stage was still uncertain); unresolved stages stay in-progress (live prob).
//
// PURE + client-safe: this module holds only the deterministic assembler + its helpers (no I/O, no
// server-only, no Supabase), so it is unit-testable under bare Node (web/test/resolvedStages.mjs). The
// server read that gathers its inputs lives in lib/data/resolvedStagesData.ts.
//
// THE CORRECTNESS TRAP (why the FAILED verdict is NEVER inferred from a probability):
//   Under conditioning an ACHIEVED stage pins to EXACTLY 1.0 (every sim), so 1.0 reliably means
//   achieved. But a FAILED stage is NOT reliably 0.0 from the probability alone - a still-alive
//   longshot can read 0.0000 from Monte-Carlo noise while not being eliminated. So the VERDICT
//   (achieved / failed / in_progress) is derived ONLY from actual results (group standings for
//   advance_group; the knockout winner_team chain for the KO rounds), passed in as `facts` below. The
//   probability series is used ONLY to recover the "was NN%" of a stage whose verdict results already
//   fixed - never to decide the verdict. A team the results say is still alive is in_progress even when
//   its current champion prob is 0.0.

export type StageKey = "advance_group" | "reach_qf" | "reach_sf" | "reach_final" | "champion";

export const STAGE_ORDER: StageKey[] = ["advance_group", "reach_qf", "reach_sf", "reach_final", "champion"];

export type Verdict = "achieved" | "failed" | "in_progress";

export interface StageResolution {
  verdict: Verdict;
  /** The model's probability from the last retained run where the stage was still uncertain (achieved
   *  -> the last run before it pinned to 1.0; failed -> the last run before it pinned to 0.0). null for
   *  in_progress (there is no "was", the live prob stands). */
  wasProb: number | null;
  /** The current-run probability for this stage (for the in-progress live read). null if no series. */
  liveProb: number | null;
}

/** The results-derived facts for ONE team. elimRound / maxWonRound come from the winner_team chain;
 *  advanceGroup comes from the group standings. NONE of these is derived from a probability. */
export interface TeamResultFacts {
  /** advance_group verdict, resolved from the final group standings (top-2 or a qualifying best-third),
   *  never from prob==0. */
  advanceGroup: Verdict;
  /** The round the team was ELIMINATED at: -1 = out at the group stage (never reached the R32); 0..4 =
   *  the KO round it LOST (R32=0, R16=1, QF=2, SF=3, Final=4); null = not eliminated / not yet resolved. */
  elimRound: number | null;
  /** The highest KO round the team WON (0..4), or null if it has won none. */
  maxWonRound: number | null;
}

/** One team's per-stage probability series, ordered by conditioned_on_results ASCENDING (index 0 is the
 *  earliest retained run, normally cond0). Each entry is that run's probability for the stage. */
export type StageSeries = Record<StageKey, number[]>;

// Achieved when the team has WON at least `wonAtLeast` KO round (reaching a round = winning its feeder);
// failed when the team was eliminated at a round strictly below `failIfElimBelow`.
// KO round indices: R32=0, R16=1, QF=2, SF=3, Final=4.
const KO_STAGES: { key: StageKey; wonAtLeast: number; failIfElimBelow: number }[] = [
  { key: "reach_qf", wonAtLeast: 1, failIfElimBelow: 2 }, // reach QF = won R16; fail if out at group/R32/R16
  { key: "reach_sf", wonAtLeast: 2, failIfElimBelow: 3 }, // reach SF = won QF
  { key: "reach_final", wonAtLeast: 3, failIfElimBelow: 4 }, // reach Final = won SF
  { key: "champion", wonAtLeast: 4, failIfElimBelow: 5 }, // champion = won Final; fail on ANY elimination
];

const EPS = 1e-9;

/** The "was NN%" for a stage whose verdict is resolved: the probability of the LAST retained run before
 *  the series settled into its absorbing resolved value (1.0 for achieved, 0.0 for failed). Elimination
 *  and achievement are both ABSORBING under conditioning (once pinned, the value stays), so the last
 *  uncertain run is the one immediately before the maximal trailing run of the resolved value.
 *
 *  COND0 FALLBACK: if the entire series is already the resolved value (the stage resolved so early that
 *  the only uncertain run would be cond0 itself, or earlier), return the first (cond0) value. DATA LAG:
 *  if the series has not yet pinned (results resolved but no post-result run retained), the trailing run
 *  is empty and we return the latest (current) value - the best available "last uncertain" read. */
export function wasProbForResolved(series: number[], resolvedValue: 0 | 1): number | null {
  if (series.length === 0) return null;
  const isResolved = resolvedValue === 1 ? (x: number) => x >= 1 - EPS : (x: number) => x <= EPS;
  let i = series.length;
  while (i > 0 && isResolved(series[i - 1])) i--;
  if (i <= 0) return series[0]; // whole series is the resolved value -> cond0 fallback
  return series[i - 1];
}

function resolveOne(verdict: Verdict, series: number[]): StageResolution {
  const liveProb = series.length ? series[series.length - 1] : null;
  const wasProb =
    verdict === "achieved" ? wasProbForResolved(series, 1)
    : verdict === "failed" ? wasProbForResolved(series, 0)
    : null;
  return { verdict, wasProb, liveProb };
}

/** Resolve all five ladder stages for ONE team. advance_group's verdict is taken verbatim from the
 *  results-derived facts; the KO stages' verdicts are derived from the winner_team chain (maxWonRound /
 *  elimRound) - NEVER from a probability. The "was NN%" is then recovered from the series per stage. */
export function resolveTeamStages(facts: TeamResultFacts, series: StageSeries): Record<StageKey, StageResolution> {
  const out = {} as Record<StageKey, StageResolution>;
  out.advance_group = resolveOne(facts.advanceGroup, series.advance_group ?? []);
  for (const st of KO_STAGES) {
    let verdict: Verdict;
    if (facts.maxWonRound != null && facts.maxWonRound >= st.wonAtLeast) verdict = "achieved";
    else if (facts.elimRound != null && facts.elimRound < st.failIfElimBelow) verdict = "failed";
    else verdict = "in_progress";
    out[st.key] = resolveOne(verdict, series[st.key] ?? []);
  }
  return out;
}

// ---- results helpers (pure) ----------------------------------------------------------------------

/** One completed knockout match, normalized: its round index + both participants + the winner. */
export interface CompletedKoMatch {
  round: number; // R32=0, R16=1, QF=2, SF=3, Final=4
  teamA: string | null;
  teamB: string | null;
  winner: string | null;
}

/** From the completed KO matches derive, per team, the highest round WON and the round LOST (a team
 *  loses at most once in the knockouts). The loser of a match is the participant that is not the winner;
 *  both participants must be known (the resolved projected-bracket sides) to attribute a loss - if a
 *  side is unknown, no loss is attributed (fail-soft: never a wrong elimination). */
export function koRoundsFromCompleted(matches: CompletedKoMatch[]): {
  wonRound: Map<string, number>;
  lostRound: Map<string, number>;
} {
  const wonRound = new Map<string, number>();
  const lostRound = new Map<string, number>();
  for (const m of matches) {
    if (!m.winner) continue;
    wonRound.set(m.winner, Math.max(wonRound.get(m.winner) ?? -1, m.round));
    const loser =
      m.teamA && m.teamB
        ? m.winner === m.teamA
          ? m.teamB
          : m.winner === m.teamB
            ? m.teamA
            : null
        : null;
    if (loser) lostRound.set(loser, m.round);
  }
  return { wonRound, lostRound };
}

/** advance_group verdict from group standings, results-only:
 *   - group not complete            -> in_progress
 *   - finished top-2                -> achieved
 *   - finished 4th                  -> failed (a 4th place never qualifies)
 *   - finished 3rd: achieved iff a qualifying best-third, but ONLY once ALL groups are complete (the
 *     best-third cutoff is unknown until then); otherwise in_progress. */
export function advanceGroupVerdict(input: {
  groupFinal: boolean;
  rank: number;
  allGroupsFinal: boolean;
  bestThirdQualifies: boolean | null;
}): Verdict {
  if (!input.groupFinal) return "in_progress";
  if (input.rank <= 2) return "achieved";
  if (input.rank === 4) return "failed";
  // rank 3: undetermined until the best-third cutoff is known (all 12 groups complete).
  if (!input.allGroupsFinal) return "in_progress";
  return input.bestThirdQualifies ? "achieved" : "failed";
}

/** Combine the group verdict + the KO winner/loss chain into ONE team's results facts. A group-eliminated
 *  team is out before the R32 (elimRound = -1); otherwise elimRound is its KO loss round (null if still
 *  alive). maxWonRound is its highest KO win. */
export function teamFacts(
  team: string,
  advanceGroup: Verdict,
  wonRound: Map<string, number>,
  lostRound: Map<string, number>,
): TeamResultFacts {
  const maxWonRound = wonRound.get(team) ?? null;
  const koLoss = lostRound.get(team) ?? null;
  // A group-eliminated team is out before the R32 (elimRound = -1); otherwise its KO loss round.
  const elimRound = advanceGroup === "failed" ? -1 : koLoss;
  return { advanceGroup, elimRound, maxWonRound };
}
