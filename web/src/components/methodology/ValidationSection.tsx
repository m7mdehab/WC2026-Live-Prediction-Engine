import { Card } from "@/components/ui/Card";
import {
  CONVERGENCE,
  MATCH_MODEL_READ,
  PRE_CHAMPION_ODDS,
} from "@/lib/data/methodology";

/** Validation section body: three honest blocks, all bound to the computed backtest artifacts.
 *  (a) pre-tournament champion odds, (b) walk-forward convergence, (c) match-model backtest read.
 *  Prose lives here (the methodology page is its only home); every number carries tabular-nums. */
export function ValidationSection() {
  return (
    <div className="space-y-4">
      {/* (a) Pre-tournament champion odds ---------------------------------------------------------- */}
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-fg">
          (a) Pre-tournament champion odds: both winners were rated, neither was the favourite
        </h3>
        <p className="text-sm text-secondary">
          Before a ball was kicked, the model refit strictly to the pre-opener data and simulated each
          32-team bracket for champion odds. In both backtest years the team that went on to win was
          rated inside the model&rsquo;s top five of 32, yet in both years the single favourite was a
          different team that did not win.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th className="py-2 pr-3 font-medium">World Cup</th>
                <th className="py-2 pr-3 font-medium">Eventual champion</th>
                <th className="py-2 pr-3 text-right font-medium">Model rank</th>
                <th className="py-2 pr-3 text-right font-medium">Champion odds</th>
                <th className="py-2 font-medium">Model favourite</th>
              </tr>
            </thead>
            <tbody>
              {PRE_CHAMPION_ODDS.map((r) => (
                <tr key={r.year} className="border-b border-border/60">
                  <td className="tnum py-2 pr-3 font-medium text-fg">{r.year}</td>
                  <td className="py-2 pr-3 text-fg">{r.champion}</td>
                  <td className="tnum py-2 pr-3 text-right font-semibold text-fg">
                    #{r.championRank} <span className="text-muted">of 32</span>
                  </td>
                  <td className="tnum py-2 pr-3 text-right text-secondary">{r.championPct.toFixed(1)}%</td>
                  <td className="py-2 text-secondary">
                    {r.favourite} <span className="tnum text-muted">({r.favouritePct.toFixed(1)}%)</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-sm text-secondary">
          Argentina was rated <span className="tnum font-semibold text-fg">#2</span> at{" "}
          <span className="tnum">10.2%</span> in 2022 and France{" "}
          <span className="tnum font-semibold text-fg">#5</span> at{" "}
          <span className="tnum">5.8%</span> in 2018, while the model&rsquo;s single favourite,{" "}
          <span className="text-fg">Brazil</span>, topped the board in both years and won neither. That
          is the calibrated, honest shape of a champion forecast: the pre-tournament favourite usually
          does not win, and a top-five rating for the team that did is the right kind of hit.
        </p>
      </Card>

      {/* (b) Walk-forward convergence -------------------------------------------------------------- */}
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-fg">
          (b) Walk-forward convergence: the model converged on the eventual winner by the semi-finals
        </h3>
        <p className="text-sm text-secondary">
          A stricter test of whether the model <em>tracks</em> the right team as the tournament unfolds.
          Holding the pre-opener strengths fixed (no in-tournament refit), at each knockout stage we
          condition only on the results that had actually happened, re-simulate the rest of the bracket,
          and record where the eventual champion ranked among the teams still alive. In both years the
          eventual winner climbed to the model&rsquo;s <strong className="text-fg">#1 remaining
          pick by the semi-final field</strong> (not before), and stayed there through to the
          final. The narrowing caveat is honest: the field halves each round, so part of that rise is
          mechanical via elimination, not the model sharpening.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {CONVERGENCE.map((y) => (
            <div key={y.year} className="rounded-md border border-border bg-bg-subtle p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold text-fg">
                  {y.year} <span className="font-normal text-secondary">· {y.champion}</span>
                </span>
                <span className="tnum text-xs text-muted">#1 by {y.becameNumberOneAt}</span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="py-1.5 pr-2 font-medium">Stage</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Field</th>
                    <th className="py-1.5 pr-2 text-right font-medium">Rank</th>
                    <th className="py-1.5 text-right font-medium">Odds</th>
                  </tr>
                </thead>
                <tbody>
                  {y.stages.map((s) => (
                    <tr key={s.stage} className="border-b border-border/50">
                      <td className="py-1.5 pr-2 text-secondary">{s.stage}</td>
                      <td className="tnum py-1.5 pr-2 text-right text-muted">{s.remaining}</td>
                      <td className={`tnum py-1.5 pr-2 text-right font-semibold ${s.rank === 1 ? "text-up" : "text-fg"}`}>
                        #{s.rank}
                      </td>
                      <td className="tnum py-1.5 text-right text-secondary">{s.pct.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted">
          France rose <span className="tnum">#5 -&gt; #3 -&gt; #1 -&gt; #1</span> (of 16, then 8, 4, 2);
          Argentina <span className="tnum">#2 -&gt; #2 -&gt; #1 -&gt; #1</span>. Both trajectories are monotone, at{" "}
          <span className="tnum">50,000</span> simulations, seed <span className="tnum">42</span>,
          conditioning only on results up to each stage.
        </p>
      </Card>

      {/* (c) Match-model backtest read ------------------------------------------------------------- */}
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-fg">
          (c) Match-model backtest: a real but modest edge, and the misses
        </h3>
        <p className="text-sm text-secondary">
          On the per-match W/D/L backtest across the two World Cups, the model called the actual outcome
          first <span className="tnum font-semibold text-fg">{MATCH_MODEL_READ.top1Pct}%</span> of the
          time and within its top two classes{" "}
          <span className="tnum font-semibold text-fg">{MATCH_MODEL_READ.top2Pct}%</span> of the time,
          scoring a Brier of <span className="tnum">{MATCH_MODEL_READ.brier.toFixed(2)}</span> against{" "}
          <span className="tnum">{MATCH_MODEL_READ.uniformBrier.toFixed(2)}</span> for a uniform
          guess, with a strength-to-finish Spearman of{" "}
          <span className="tnum">{MATCH_MODEL_READ.spearman.toFixed(2)}</span>. That is a real but
          modest edge, not a crystal ball.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <ValFact label="Top-1" value={`${MATCH_MODEL_READ.top1Pct}%`} sub="actual outcome called first" />
          <ValFact label="Top-2" value={`${MATCH_MODEL_READ.top2Pct}%`} sub="within top two classes" />
          <ValFact label="Brier" value={MATCH_MODEL_READ.brier.toFixed(2)} sub={`vs ${MATCH_MODEL_READ.uniformBrier.toFixed(2)} uniform`} />
          <ValFact label="Spearman" value={MATCH_MODEL_READ.spearman.toFixed(2)} sub="strength to finish" />
        </div>
        <div className="mt-3 rounded-md border border-down/30 bg-bg-subtle p-3 text-sm text-secondary">
          <strong className="text-fg">The misses.</strong> The model&rsquo;s top champion pick was{" "}
          <span className="text-fg">{MATCH_MODEL_READ.misses.favouriteBothYears}</span> in both years,
          and {MATCH_MODEL_READ.misses.favouriteBothYears} won neither.{" "}
          <span className="text-fg">{MATCH_MODEL_READ.misses.finalistMissed}</span>, the{" "}
          <span className="tnum">{MATCH_MODEL_READ.misses.finalistYear}</span> finalist, was rated only{" "}
          <span className="tnum font-semibold text-fg">#{MATCH_MODEL_READ.misses.finalistRank}</span>{" "}
          pre-tournament: a deep run the model did not see coming. A modest edge means it is right more
          often than chance, not that it is right about everyone.
        </div>
      </Card>
    </div>
  );
}

/** Local dense fact for the validation grid (mirrors Section.Fact; kept local to this block). */
function ValFact({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-subtle p-3">
      <div className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="tnum mt-0.5 font-display text-lg font-semibold text-fg">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-secondary">{sub}</div> : null}
    </div>
  );
}
