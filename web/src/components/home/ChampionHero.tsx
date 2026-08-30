import { Flag } from "@/components/ui/Flag";
import { CrownMark } from "@/components/brand/marks";
import { Confetti } from "@/components/home/Confetti";
import { championWhy } from "@/lib/whyLine";
import { flagConfettiShades } from "@/lib/flagColors";
import { simPct } from "@/lib/utils";
import type { ChampionContext, ModelPredictionRun } from "@/lib/types";
import type { PreTournamentCall } from "@/lib/data/retrospective";

/** "Updated D MMM YYYY" from the run's generated timestamp (UTC, deterministic, no hardcode,
 *  stays correct on every re-run). */
function formatUpdated(iso: string | null): string {
  if (!iso) return "–";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(iso));
}

/** The centerpiece: the current title leader as a crowned, celebratory hero.
 *  Light = warm gold wash + confetti; dark = same + glow (via .champion-surface).
 *  The "why" line is grounded strictly in the champion's rating + recent form (4B.1). */
export function ChampionHero({
  champion,
  run,
  complete = false,
  preCall = null,
}: {
  champion: ChampionContext | null;
  run: ModelPredictionRun | null;
  /** Tournament finished: render the champion as a SETTLED fact, not a live title probability. */
  complete?: boolean;
  /** The pre-tournament call the model earned (settled mode only): its No.1 pick won, and - when
   *  calledExactFinal - its top two were exactly the two finalists. Null when the results don't
   *  support the flex (or pre-completion). */
  preCall?: PreTournamentCall | null;
}) {
  if (!champion) {
    return (
      <div className="champion-surface rounded-card border p-6">
        <p className="text-secondary">No forecast published yet.</p>
      </div>
    );
  }

  return (
    <section className="champion-surface relative overflow-hidden rounded-card border p-6">
      {/* celebratory confetti/ribbon fall, contained, behind content. Particles take the champion's
          flag colour shades (the gold framing below stays unchanged). */}
      <Confetti shades={flagConfettiShades(champion.team)} />

      <div className="relative z-10 mb-4 flex items-baseline justify-between">
        <h2 className="font-display text-xs font-semibold tracking-[0.15em] text-gold-strong uppercase">
          {complete ? "World Cup 2026 Champion" : "Model’s Champion Pick"}
        </h2>
        <span className="text-xs text-muted">{complete ? "final result" : "title probability"}</span>
      </div>

      <div className="relative z-10 flex flex-col items-center gap-6 sm:flex-row sm:items-center">
        {/* crowned flag, crown's band rests on the flag's top edge, overlapping ~6px */}
        <div className="relative grid shrink-0 place-items-center px-2 pt-7">
          <div className="relative inline-block">
            <span className="champion-flag-ring block overflow-hidden rounded-md">
              <Flag team={champion.team} size="text-[64px]" className="block" link={false} />
            </span>
            <CrownMark
              width={44}
              title="Champion crown"
              className="pointer-events-none absolute bottom-full left-1/2 z-10 -translate-x-1/2 translate-y-[6px] drop-shadow-sm"
            />
          </div>
        </div>

        {/* name + headline number + why */}
        <div className="flex-1 text-center sm:text-left">
          <div className="font-display text-2xl font-bold text-fg sm:text-3xl">
            {champion.team}
          </div>
          {complete ? (
            // Settled fact, not a live probability: the model conditioned on all 104 results has this
            // team as champion. Render the OUTCOME, never "100.0% to win it" (a certainty is not odds).
            <>
              <div className="mt-1 flex items-baseline justify-center gap-2 sm:justify-start">
                <span className="font-display text-4xl leading-none font-bold text-gold-strong sm:text-5xl">
                  Champions
                </span>
              </div>
              {/* The pre-tournament call the model earned - derived from the cond0 ranking + actual
                  results (never hardcoded), stated only when true. The modest cond0 probability is
                  shown verbatim so the flex reads as "outright favourite", not "we knew". */}
              {preCall ? (
                preCall.calledExactFinal && preCall.runnerUpTeam ? (
                  <p className="mt-2 max-w-prose text-sm leading-relaxed text-fg">
                    From day one, the model’s top two were the eventual finalists:{" "}
                    <span className="font-semibold">{champion.team}</span> at{" "}
                    <span className="tnum font-semibold">{simPct(preCall.championCond0)}</span>,{" "}
                    <span className="font-semibold">{preCall.runnerUpTeam}</span> at{" "}
                    <span className="tnum font-semibold">{simPct(preCall.runnerUpCond0)}</span>. It called the exact Final.
                  </p>
                ) : (
                  <p className="mt-2 max-w-prose text-sm leading-relaxed text-fg">
                    The model’s outright No. 1 pick from day one, at{" "}
                    <span className="tnum font-semibold">{simPct(preCall.championCond0)}</span>.
                  </p>
                )
              ) : null}
            </>
          ) : (
            <>
              <div className="mt-1 flex items-baseline justify-center gap-2 sm:justify-start">
                <span className="tnum font-display text-5xl leading-none font-bold text-gold-strong sm:text-6xl">
                  {simPct(champion.champion)}
                </span>
                <span className="text-sm font-medium tracking-wide text-secondary uppercase">
                  to win it
                </span>
              </div>
              {champion.reachFinal != null ? (
                <p className="tnum mt-2 text-sm text-secondary">
                  Reaches the WC 2026 final in{" "}
                  <span className="font-semibold text-fg">{simPct(champion.reachFinal)}</span> of{" "}
                  {(run?.iterations ?? 50000).toLocaleString()} simulations
                </p>
              ) : null}
            </>
          )}
          {/* 2d: settled mode already carries the single pre-tournament-call line above; the generic
              championWhy ("The model's title pick") would stack a second claim into a paragraph. Show it
              only when there is no settled call line (live, or a completed run whose No.1 did not win). */}
          {complete && preCall ? null : (
            <p className="mt-3 max-w-prose text-sm leading-relaxed text-secondary">
              {championWhy(champion)}
            </p>
          )}
        </div>
      </div>

      {run ? (
        <p className="relative z-10 mt-5 border-t border-gold-line/40 pt-3 text-xs text-muted">
          {/* keep each segment intact so the line wraps only at the separators (the date never
              splits across lines) */}
          <span className="whitespace-nowrap">Backtested on 2018 &amp; 2022</span>{" · "}
          <span className="whitespace-nowrap">Updated {formatUpdated(run.created_at)}</span>{" · "}
          <span className="whitespace-nowrap">{complete ? "Final run, all 104 results in" : "recalculates after every result"}</span>
        </p>
      ) : null}
    </section>
  );
}
