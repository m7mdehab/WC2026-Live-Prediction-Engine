// forecast data layer - owned by the forecast track.
// Reads team_probabilities + teams + the current run, then derives the percentile signals the
// /forecast table needs. The dark-horse / overvalued CARDS are now sourced from the sticky
// surprise index (lib/data/surpriseIndex + surpriseIndexData): they read ACHIEVED outcomes against
// the FROZEN cond0 baseline, not live deep-run odds, and are sticky after elimination.
//
// Convention (Wave 0): the shared lib/data.ts + lib/types.ts are edited only by live-ops; each track
// adds its reads in its own module. We re-use teamElo (the locked model-v1.0 ratings) for the pedigree
// blend so the forecast page speaks the same rating signal as the match/group pages.
import "server-only";
import { publicClient, liveClient } from "@/lib/supabase/public";
import { cachedRead, TAGS } from "@/lib/data/cache";
import { TEAM_ELO, teamElo } from "@/lib/teamElo";
import { getSurpriseIndex } from "@/lib/data/surpriseIndexData";
import {
  assembleSurprise,
  type Cond0StageProbs, type MatchOutcome, type StageLevel, type TeamResultsFacts,
} from "@/lib/data/surpriseIndex";
import type { ModelPredictionRun, TeamProbabilities } from "@/lib/types";
import type {
  DarkHorse, ForecastData, ForecastTeam, Overvalued,
} from "@/lib/types/forecast";

/** Percentile of a value within a field, in [0,1] (1 = best). `better` returns true when `a` ranks
 *  ahead of `b`. Computed as (# strictly-worse) / (n−1) so the worst is 0 and the best is 1. */
function percentile<T>(items: T[], value: T, better: (a: T, b: T) => boolean): number {
  const n = items.length;
  if (n <= 1) return 1;
  let worse = 0;
  for (const other of items) if (better(value, other)) worse++;
  return worse / (n - 1);
}

/** Cards from the sticky surprise index, structurally the DarkHorse / Overvalued shapes. */
type SurpriseCards = { darkHorses: DarkHorse[]; overvalued: Overvalued[] };
const EMPTY_CARDS: SurpriseCards = { darkHorses: [], overvalued: [] };

/** Turn the raw per-team rows into the full ForecastData: percentiles for the table, plus the
 *  supplied surprise-index cards (dark horses / overvalued). */
function deriveForecast(
  run: ModelPredictionRun | null,
  rows: Omit<ForecastTeam, "eloPct" | "fifaPct" | "pedigreePct" | "deepRunPct">[],
  demo: boolean,
  cards: SurpriseCards,
): ForecastData {
  const eloVals = rows.map((r) => r.elo).filter((e): e is number => e != null);
  const fifaVals = rows.map((r) => r.fifaRank).filter((f): f is number => f != null);
  const qfVals = rows.map((r) => r.reachQf ?? 0);

  const teams: ForecastTeam[] = rows.map((r) => {
    const eloPct = r.elo != null ? percentile(eloVals, r.elo, (a, b) => a > b) : null;
    // lower FIFA rank number is better
    const fifaPct = r.fifaRank != null ? percentile(fifaVals, r.fifaRank, (a, b) => a < b) : null;
    const present = [eloPct, fifaPct].filter((p): p is number => p != null);
    const pedigreePct = present.length ? present.reduce((s, p) => s + p, 0) / present.length : null;
    const deepRunPct = percentile(qfVals, r.reachQf ?? 0, (a, b) => a > b);
    return { ...r, eloPct, fifaPct, pedigreePct, deepRunPct };
  });

  teams.sort((a, b) => (b.champion ?? 0) - (a.champion ?? 0));
  return { run, teams, darkHorses: cards.darkHorses, overvalued: cards.overvalued, demo };
}

/** The /forecast payload for the current run: champion odds + stage odds for all 48 teams, plus
 *  the sticky surprise-index dark-horse / overvalued cards. Returns null when no run is published (the
 *  page then renders its empty state). Set FORECAST_DEMO=1 to render a deterministic dev fixture. */
export function getForecastData(): Promise<ForecastData | null> {
  return cachedRead("forecast-data", [TAGS.forecast, TAGS.run], _getForecastDataUncached);
}

/** The run_id of the LATEST published run, read live and UNCACHED (liveClient, no-store) - never from
 *  any cache tier. Used only to cross-check the (possibly Data-Cached) forecast payload for staleness
 *  (see lib/data/forecastFreshness). Fails soft to null: a probe outage skips the freshness banner,
 *  it never blanks the page. */
export async function getLiveRunId(): Promise<string | null> {
  try {
    const sb = liveClient();
    const { data, error } = await sb.from("current_run").select("run_id").limit(1);
    if (error) return null;
    return (data?.[0] as { run_id: string } | undefined)?.run_id ?? null;
  } catch {
    return null;
  }
}

async function _getForecastDataUncached(): Promise<ForecastData | null> {
  try {
    const sb = publicClient();
    const { data: runs, error: runErr } = await sb.from("current_run").select("*").limit(1);
    if (runErr) throw runErr;
    const run = (runs?.[0] as ModelPredictionRun | undefined) ?? null;
    if (!run) return demoForecast();

    const [tp, tm] = await Promise.all([
      sb.from("team_probabilities").select("*").eq("run_id", run.run_id),
      // scaling-guard-ok: teams is bounded by the tournament (48 rows, the qualified field)
      sb.from("teams").select("name, group_code, host_flag, fifa_rank"),
    ]);
    if (tp.error) throw tp.error;
    if (tm.error) throw tm.error;

    const meta = new Map<string, { group: string | null; host: boolean; rank: number | null }>(
      ((tm.data ?? []) as { name: string; group_code: string | null; host_flag: boolean; fifa_rank: number | null }[])
        .map((t) => [t.name, { group: t.group_code, host: t.host_flag, rank: t.fifa_rank }]),
    );

    const probs = (tp.data ?? []) as TeamProbabilities[];
    if (probs.length === 0) return demoForecast();

    const rows = probs.map((p) => {
      const m = meta.get(p.team);
      return {
        team: p.team,
        groupCode: m?.group ?? null,
        hostFlag: m?.host ?? false,
        fifaRank: m?.rank ?? null,
        elo: teamElo(p.team),
        champion: p.champion,
        reachFinal: p.reach_final,
        reachSf: p.reach_sf,
        reachQf: p.reach_qf,
        advanceGroup: p.advance_group,
      };
    });

    // Cards come from the sticky surprise index (results vs the frozen cond0 baseline). Fail-soft: a
    // surprise-index outage degrades ONLY the two cards to empty; the forecast table still renders.
    let cards: SurpriseCards = EMPTY_CARDS;
    try {
      const surprise = await getSurpriseIndex();
      if (surprise) cards = { darkHorses: surprise.darkHorses as DarkHorse[], overvalued: surprise.overvalued as Overvalued[] };
    } catch (err) {
      console.error("Failed to load surprise index for forecast cards:", err);
    }
    return deriveForecast(run, rows, false, cards);
  } catch (err) {
    console.error("Failed to load forecast data from Supabase:", err);
    return demoForecast();
  }
}

// ---------------------------------------------------------------------------------------------------
// Dev-only fixture. Gated behind FORECAST_DEMO=1 so production never serves it - it exists so the page
// can be built, screenshotted and reviewed without a live Supabase connection. The stage odds are
// synthesised deterministically from the locked Elo ratings (with a host-nation deep-run nudge). The
// surprise-index CARDS are synthesised the same way: a scripted, plausible late-tournament outcome
// (deepest stage reached + per-match points) run through the SAME pure assembler production uses, so
// the cards render on real achieved-outcome logic (never a hand-picked list).
// ---------------------------------------------------------------------------------------------------

// FIFA ranks (data/teams_2026.csv) - inlined only for the offline fixture; production reads the
// teams table. Keep in sync if the field is re-seeded.
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

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

// A scripted, plausible late-tournament outcome for the demo cards: the deepest stage a set of teams
// ACTUALLY reached. Chosen to exercise the metric (a big longshot in the semis, a couple of top seeds
// crashing early); every other team defaults to a group/round-of-32 exit by its group odds. This is
// sample data only (the page shows a "Sample data" tag); production derives all of this from results.
const DEMO_DEEPEST: Record<string, StageLevel> = {
  Croatia: "champion",
  Morocco: "final",
  "Curaçao": "semi_finals", Norway: "semi_finals",
  France: "quarter_finals", Panama: "quarter_finals", "Cape Verde": "quarter_finals", Ecuador: "quarter_finals",
  England: "round_of_16", Portugal: "round_of_16", Colombia: "round_of_16", Japan: "round_of_16",
  Argentina: "round_of_16", Netherlands: "round_of_16", Senegal: "round_of_16", Switzerland: "round_of_16",
  Spain: "group", Brazil: "group", Germany: "group", Belgium: "group",
};

/** Group-match points for a demo team, from how far it went: deeper runs banked more in the group. */
function demoGroupPoints(stage: StageLevel): number[] {
  switch (stage) {
    case "champion": case "final": case "semi_finals": return [3, 3, 3];
    case "quarter_finals": case "round_of_16": return [3, 3, 1];
    case "round_of_32": return [3, 1, 1];
    default: return [1, 0, 0]; // crashed out of the group
  }
}

/** Build the dev fixture, or null if FORECAST_DEMO isn't set. */
function demoForecast(): ForecastData | null {
  if (process.env.FORECAST_DEMO !== "1") return null;

  const names = Object.keys(TEAM_ELO);
  // raw, monotone-decreasing stage chain from Elo (+ a deep-run nudge for hosts)
  const raw = names.map((team) => {
    const elo = TEAM_ELO[team];
    const hb = DEMO_HOSTS.has(team) ? 0.7 : 0;
    const advanceGroup = sigmoid((elo - 1815) / 55);
    const reachR16 = advanceGroup * sigmoid((elo - 1855) / 70 + 0.5 * hb);
    const reachQf = reachR16 * sigmoid((elo - 1905) / 75 + hb);
    const reachSf = reachQf * sigmoid((elo - 1945) / 70 + 0.5 * hb);
    const reachFinal = reachSf * sigmoid((elo - 1985) / 65);
    const championRaw = reachFinal * sigmoid((elo - 2010) / 60);
    return { team, elo, advanceGroup, reachR16, reachQf, reachSf, reachFinal, championRaw };
  });
  // normalise champion to sum to 1 (exactly one winner) - the headline number reads realistically
  const champSum = raw.reduce((s, r) => s + r.championRaw, 0) || 1;

  const rows = raw.map((r) => ({
    team: r.team,
    groupCode: DEMO_GROUP[r.team] ?? null,
    hostFlag: DEMO_HOSTS.has(r.team),
    fifaRank: DEMO_FIFA[r.team] ?? null,
    elo: r.elo,
    champion: r.championRaw / champSum,
    reachFinal: r.reachFinal,
    reachSf: r.reachSf,
    reachQf: r.reachQf,
    advanceGroup: r.advanceGroup,
  }));

  // Synthesise the surprise-index cards through the REAL assembler on the scripted outcome above.
  const cond0 = new Map<string, Cond0StageProbs>(
    raw.map((r) => [r.team, {
      advance_group: r.advanceGroup,
      reach_r16: r.reachR16,
      reach_qf: r.reachQf,
      reach_sf: r.reachSf,
      reach_final: r.reachFinal,
      champion: r.championRaw / champSum,
    }]),
  );
  const facts: TeamResultsFacts[] = raw.map((r) => {
    const deepest = DEMO_DEEPEST[r.team] ?? (r.advanceGroup > 0.5 ? "round_of_32" : "group");
    const pts = demoGroupPoints(deepest);
    // per-match expected points from the pre-tournament group odds (a deterministic proxy for a
    // pre-kickoff run): a favourite is expected to bank more, so surprise nets against it.
    const expected = Math.min(2.6, 0.6 + r.advanceGroup * 1.8);
    const matches: MatchOutcome[] = pts.map((p) => ({ achievedPoints: p, expectedPoints: expected }));
    return { team: r.team, hostFlag: DEMO_HOSTS.has(r.team), fifaRank: DEMO_FIFA[r.team] ?? null, deepestStage: deepest, matches };
  });
  const surprise = assembleSurprise(facts, cond0);
  const cards: SurpriseCards = {
    darkHorses: surprise.darkHorses as DarkHorse[],
    overvalued: surprise.overvalued as Overvalued[],
  };

  const run: ModelPredictionRun = {
    run_id: "demo", created_at: "2026-06-07T00:00:00Z",
    model_version: "demo-fixture", simulator_version: "demo", code_version: null,
    git_commit: null, data_version: null, data_hash: null, rng_seed: null,
    training_cutoff_date: null, data_cutoff_time: null, calibration_method: null,
    run_type: "demo", iterations: 50000, conditioned_on_results: 104,
  };
  return deriveForecast(run, rows, true, cards);
}
