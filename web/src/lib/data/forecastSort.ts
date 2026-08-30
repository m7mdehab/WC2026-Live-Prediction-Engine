import type { ForecastTeam } from "@/lib/types/forecast";
import type { StageKey, StageResolution } from "@/lib/data/resolvedStages";

/** The resolved-stage map keyed by team name (a subset of ResolvedStages; only `champion` is read). */
export type ResolutionByTeam = Record<string, Partial<Record<StageKey, StageResolution>>>;

/**
 * Order the forecast table as a MODEL-STANDING ordering end to end, never falling to the alphabet.
 *
 * ALIVE teams (still in championship contention) sort by their CURRENT champion odds desc, so they
 * surface at the top naturally. ELIMINATED teams have a current champion odds of ~0, so instead of
 * tying at 0 and dropping to alphabetical (Algeria, Australia, Austria...), they sort by their LAST
 * LIVE champion odds - the model's champion probability at the last retained run before they were
 * knocked out (`resolution[team].champion.wasProb`). A fallen contender (Brazil, last live ~15%) thus
 * ranks above a fallen minnow (Bosnia, last live ~2%). All eliminated teams sit below all alive teams.
 *
 * Elimination is read from RESULTS (the champion stage's resolved verdict === "failed"), NEVER from a
 * probability hitting 0: a still-alive longshot at ~0% keeps verdict "in_progress" and stays in the
 * alive block, ordered by its real (tiny) current odds. Pure + deterministic; the ONLY alphabetical
 * use is a final exact-tie breaker (same tier + identical odds), so it is never the ordering signal.
 */
export function sortForecastTeams(teams: ForecastTeam[], resolution: ResolutionByTeam | undefined): ForecastTeam[] {
  const key = (t: ForecastTeam): { tier: 0 | 1; val: number } => {
    const champ = resolution?.[t.team]?.champion;
    if (champ?.verdict === "failed") {
      // eliminated: below the alive block, ranked by last-live champ odds (never by name)
      return { tier: 0, val: champ.wasProb ?? 0 };
    }
    // alive / in-progress: ranked by current champ odds (a ~0% longshot stays here, not with the out teams)
    return { tier: 1, val: t.champion ?? 0 };
  };
  return [...teams].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (kb.tier !== ka.tier) return kb.tier - ka.tier; // alive (1) above eliminated (0)
    if (kb.val !== ka.val) return kb.val - ka.val;     // odds desc within tier
    return a.team.localeCompare(b.team);               // deterministic tiebreak ONLY on an exact tie
  });
}
