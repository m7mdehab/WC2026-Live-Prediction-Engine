// "How the model saw it" - the settled-tournament retrospective that REPLACES the live Title race card.
//
// WHY this exists: post-tournament, 47 of 48 teams have champion probability EXACTLY 0, so ordering the
// live Title race by current champion odds is degenerate - the stable sort leaves the database's
// (alphabetical) insertion order, and labelling that "final standings" is FALSE. So we order by a
// quantity that is real and well separated - the model's PRE-TOURNAMENT (cond0) champion probability -
// and annotate each row with how far the team ACTUALLY got.
//
// The podium (champion / runner-up / third / fourth) is derived POSITIVELY from the resolved knockout
// RESULTS - M104 (final) gives champion=winner, runner-up=loser; M103 (third-place play-off) gives
// third=winner, fourth=loser. Absence of an elimination record is NOT proof of anything and must never
// stand in for the champion: the champion has no forward fixture after the final, so it IS in the
// elimination map (with a null exit stage), and reading "champion == the team not in the map" wrongly
// labelled Spain "Group stage". Podium-first labelling fixes that and lets bronze be awarded.
import "server-only";
import { publicClient } from "@/lib/supabase/public";
import { cachedRead, TAGS } from "@/lib/data/cache";
import { getPlayerEliminations } from "@/lib/data/playerEliminationData";
import { type ExitStage, type EliminationFacts } from "@/lib/data/playerElimination";

export interface RetrospectiveRow {
  team: string;
  /** cond0 (pre-tournament) champion probability in [0,1]. The ORDERING key (descending). */
  cond0: number;
  /** How far the team actually got, as a settled fact from results (podium first, else exit stage). */
  finish: string;
  /** Actual podium finish (1..3) - the ONLY rows a medal accent may adorn. null for everyone else,
   *  including 4th (no medal). Derived from results, never from cond0 rank or absence. */
  podium: 1 | 2 | 3 | null;
}

/** The four settled podium places, by TEAM NAME, read from the resolved M104/M103 results. */
export interface Podium {
  champion: string | null;
  runnerUp: string | null;
  third: string | null;
  fourth: string | null;
}

/** Exit stage -> human finish phrase, for NON-podium rows only (the podium places get their own labels).
 *  `final` should not be reached here (the finalist losers are the runner-up, labelled via the podium),
 *  but is mapped defensively. */
const EXIT_FINISH: Record<ExitStage, string> = {
  group: "Group stage",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_finals: "Quarter-finals",
  semi_finals: "Semi-finals",
  final: "Runners-up",
};

const HOW_MANY = 8;

/** PURE assembler: cond0 rows + the elimination facts + the results-derived podium -> the retrospective
 *  rows (cond0-ordered, podium-first labels, medals only on real podium places). Exported so the
 *  DERIVATION is unit-tested against the REAL computeEliminations output, without Supabase. */
export function assembleRetrospective(
  cond0Rows: { team: string; champion: number | null }[],
  eliminations: EliminationFacts,
  podium: Podium,
): RetrospectiveRow[] {
  const top = cond0Rows
    .filter((r) => r.champion != null)
    .sort((a, b) => (b.champion ?? 0) - (a.champion ?? 0)) // cond0 champion odds DESC (never alphabetical)
    .slice(0, HOW_MANY);

  const podiumOf = (team: string): 1 | 2 | 3 | null =>
    team === podium.champion ? 1 : team === podium.runnerUp ? 2 : team === podium.third ? 3 : null;

  const finishOf = (team: string): string => {
    if (team === podium.champion) return "Champions";
    if (team === podium.runnerUp) return "Runners-up";
    if (team === podium.third) return "Third place";
    if (team === podium.fourth) return "Fourth place";
    const fact = eliminations.get(team);
    // A non-podium row that lost a KO or failed its group has a real exit stage; a null exit stage
    // (only the champion, already handled above) or an absent record falls back to the null glyph.
    return fact && fact.exitStage ? EXIT_FINISH[fact.exitStage] : "—";
  };

  return top.map((r) => ({ team: r.team, cond0: r.champion ?? 0, finish: finishOf(r.team), podium: podiumOf(r.team) }));
}

/** The pre-tournament CALL the model earned: the flex shown on the champion hero. Derived from the
 *  (cond0-descending) retrospective rows, so it is a FACT of the data, never a hardcode - and it makes
 *  itself only when it is TRUE. */
export interface PreTournamentCall {
  /** The champion's pre-tournament (cond0) champion probability. */
  championCond0: number;
  /** The runner-up's name + cond0 probability, when the model's No.2 was the actual runner-up. */
  runnerUpTeam: string | null;
  runnerUpCond0: number | null;
  /** The model's cond0 top two were EXACTLY the two finalists (No.1 champion, No.2 runner-up). */
  calledExactFinal: boolean;
}

/** Finish -> an ordinal band for the predicted-vs-actual delta (smaller = went further). Positions 1..4
 *  are determinate (podium); everything below is a BAND (a round reached), never a global 1..48 place -
 *  those are indeterminate without per-edition placement regulations. Semi-finals is mapped defensively
 *  (the four semi-finalists are the podium places, so it should not appear among the rows). */
const FINISH_BAND: Record<string, number> = {
  "Champions": 1,
  "Runners-up": 2,
  "Third place": 3,
  "Fourth place": 4,
  "Semi-finals": 5,
  "Quarter-finals": 6,
  "Round of 16": 7,
  "Round of 32": 8,
  "Group stage": 9,
};

export interface RetrospectiveDelta {
  /** 1-based model (cond0) rank = the row's position in the cond0-ordered list. */
  modelRank: number;
  /** Competition rank of the ACTUAL finish AMONG THE SHOWN ROWS ONLY (ties share a rank). NOT a global
   *  1..48 placement - it is only meaningful relative to the other seven teams on the card. */
  actualRank: number;
  /** modelRank - actualRank. >0: finished BETTER than its model rank implied (among the eight); <0: worse. */
  delta: number;
  dir: "better" | "worse" | "match";
}

/** Predicted-vs-actual delta for each retrospective row, scoped strictly to the eight shown teams. The
 *  actual rank is a competition rank (with ties) over the rows' finish BANDS - deliberately NOT a global
 *  placement, since positions five and below are indeterminate. Pure + exported so the "among the eight,
 *  never global" property and the colour direction are unit-tested. */
export function deltaAmongShown(rows: RetrospectiveRow[]): RetrospectiveDelta[] {
  const bandOf = (r: RetrospectiveRow) => FINISH_BAND[r.finish] ?? 99;
  return rows.map((r, i) => {
    const b = bandOf(r);
    // competition rank among the shown rows: 1 + how many shown teams finished strictly further.
    const actualRank = 1 + rows.filter((o) => bandOf(o) < b).length;
    const modelRank = i + 1;
    const delta = modelRank - actualRank;
    return { modelRank, actualRank, delta, dir: delta > 0 ? "better" : delta < 0 ? "worse" : "match" };
  });
}

/** Derive the pre-tournament call from the retrospective rows. Returns null unless the model's
 *  cond0 No.1 is the actual champion (podium 1) - we never claim a call the results don't support.
 *  `calledExactFinal` additionally requires the cond0 No.2 to be the actual runner-up (podium 2). */
export function preTournamentCall(rows: RetrospectiveRow[]): PreTournamentCall | null {
  const first = rows[0];
  if (!first || first.podium !== 1) return null; // only when the model's top pick actually won
  const second = rows[1] ?? null;
  const calledExactFinal = second?.podium === 2;
  return {
    championCond0: first.cond0,
    runnerUpTeam: calledExactFinal ? second!.team : null,
    runnerUpCond0: calledExactFinal ? second!.cond0 : null,
    calledExactFinal,
  };
}

/** Read the settled podium POSITIVELY from the resolved knockout results (M104 final, M103 third-place).
 *  Winner from match_results.winner_team; the two participants from the current run's resolved
 *  projected_bracket. Fail-soft to an all-null podium (the assembler then labels via exit stage only). */
async function fetchPodium(sb: ReturnType<typeof publicClient>): Promise<Podium> {
  const empty: Podium = { champion: null, runnerUp: null, third: null, fourth: null };
  try {
    const { data: cr } = await sb.from("current_run").select("run_id").limit(1);
    const runId = (cr?.[0] as { run_id: string } | undefined)?.run_id ?? null;
    const [pb, mr] = await Promise.all([
      runId
        ? sb.from("projected_bracket").select("match_id, team_a, team_b, a_resolved, b_resolved")
            .eq("run_id", runId).in("match_id", ["M103", "M104"])
        : Promise.resolve({ data: [], error: null }),
      // scaling-guard-ok: filtered to two match ids.
      sb.from("match_results").select("match_id, winner_team, status").in("match_id", ["M103", "M104"]),
    ]);
    const sides = new Map<string, { a: string | null; b: string | null }>();
    for (const r of (pb.data ?? []) as {
      match_id: string; team_a: string | null; team_b: string | null; a_resolved: boolean; b_resolved: boolean;
    }[]) sides.set(r.match_id, { a: r.a_resolved ? r.team_a : null, b: r.b_resolved ? r.team_b : null });
    const winners = new Map<string, string | null>();
    for (const r of (mr.data ?? []) as { match_id: string; winner_team: string | null; status: string }[])
      if (r.status === "completed") winners.set(r.match_id, r.winner_team);

    const placesFor = (matchId: string): { winner: string | null; loser: string | null } => {
      const s = sides.get(matchId);
      const w = winners.get(matchId) ?? null;
      if (!s || !w) return { winner: null, loser: null };
      const loser = s.a === w ? s.b : s.b === w ? s.a : null; // the resolved side that is NOT the winner
      return { winner: w, loser };
    };
    const fin = placesFor("M104");
    const tp = placesFor("M103");
    return { champion: fin.winner, runnerUp: fin.loser, third: tp.winner, fourth: tp.loser };
  } catch (err) {
    console.error("Failed to read the podium (M103/M104):", err);
    return empty;
  }
}

export function getModelRetrospective(): Promise<RetrospectiveRow[]> {
  return cachedRead("model-retrospective", [TAGS.forecast, TAGS.run, TAGS.players], _getModelRetrospectiveUncached);
}

async function _getModelRetrospectiveUncached(): Promise<RetrospectiveRow[]> {
  try {
    const sb = publicClient();
    // The cond0 run = the EARLIEST conditioned_on_results=0 run (immutable, hijack-proof).
    const baseRun = await sb
      .from("model_prediction_runs").select("run_id")
      .eq("conditioned_on_results", 0).order("created_at", { ascending: true }).limit(1);
    if (baseRun.error) throw baseRun.error;
    const runId = (baseRun.data?.[0] as { run_id: string } | undefined)?.run_id ?? null;
    if (!runId) return [];

    // scaling-guard-ok: team_probabilities for ONE run is bounded by the field (48 rows).
    const [tp, eliminations, podium] = await Promise.all([
      sb.from("team_probabilities").select("team, champion").eq("run_id", runId),
      getPlayerEliminations(),
      fetchPodium(sb),
    ]);
    if (tp.error) throw tp.error;

    return assembleRetrospective(
      (tp.data ?? []) as { team: string; champion: number | null }[],
      eliminations,
      podium,
    );
  } catch (err) {
    console.error("Failed to assemble the model retrospective:", err);
    return [];
  }
}
