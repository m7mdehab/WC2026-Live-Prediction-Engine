import type { ProjectedBracket } from "@/lib/types";

/** The SETTLED podium - champion, runner-up, third, fourth - derived POSITIVELY from the resolved
 *  Final (M104) and third-place playoff (M103): the projected winner of each match plus the OTHER side.
 *  No tiebreak is recomputed; this reads the engine's already-applied results (proj_winner).
 *
 *  Returns null unless BOTH matches carry a projected winner naming one of their two sides AND the four
 *  teams are distinct - so a live / unresolved bracket (or a missing playoff) yields null and callers
 *  fall back to their live default. This is what keeps the default reversible: a future tournament with
 *  an unresolved bracket has no settled podium and the live rule applies, with no date anywhere. */
export function settledPodium(bracket: ProjectedBracket | null | undefined): string[] | null {
  if (!bracket) return null;
  const fin = bracket.matches?.["M104"];
  const tp = bracket.matches?.["M103"];
  if (!fin || !tp) return null;

  const otherSide = (
    m: { team_a: string | null; team_b: string | null },
    winner: string | null,
  ): string | null => (winner === m.team_a ? m.team_b : winner === m.team_b ? m.team_a : null);

  const champion = fin.proj_winner;
  const runnerUp = otherSide(fin, champion);
  const third = tp.proj_winner;
  const fourth = otherSide(tp, third);

  const podium = [champion, runnerUp, third, fourth];
  if (podium.some((t) => !t)) return null; // a side unresolved -> no settled podium
  const distinct = new Set(podium as string[]);
  if (distinct.size !== 4) return null; // defensive: never a degenerate/duplicated podium
  return podium as string[];
}
