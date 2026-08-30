import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import type { OutcomeClass } from "@/lib/types/methodology";
import { RELIABILITY_2026, TOURNAMENT_CALIBRATION_2026 } from "@/lib/data/methodology";

// The real-tournament calibration read (Phase 3b): the model's own probabilities scored against what
// actually happened across all of WC 2026, group + knockout, nothing omitted. It leads the historical
// backtest below (ValidationSection). Every figure is transcribed in methodology.ts from the committed
// artifact (data/backtest/wc2026_calibration.json); nothing is computed here.

const C = TOURNAMENT_CALIBRATION_2026;

// Class visual tokens, identical to ReliabilityChart (design_tokens.json accents per outcome class).
const FILL: Record<OutcomeClass, string> = {
  home_win: "fill-confident",
  draw: "fill-upset",
  away_win: "fill-up",
};
const DOT: Record<OutcomeClass, string> = {
  home_win: "bg-confident",
  draw: "bg-upset",
  away_win: "bg-up",
};
const CLASS_LABEL: Record<OutcomeClass, string> = {
  home_win: "Home win",
  draw: "Draw",
  away_win: "Away win",
};

// Square reliability plot, mirroring ReliabilityChart's geometry. This is a STATIC single 2026 curve
// (group + knockout combined), so there is no year toggle and no client state: ReliabilityChart itself
// is hardwired to a 2018/2022 toggle and cannot render a 2026 series, so its visual is reused here.
const SIZE = 300;
const PAD = { l: 34, r: 12, t: 12, b: 30 };
const INNER = SIZE - PAD.l - PAD.r;
const PLOT = SIZE - PAD.t - PAD.b;
const xOf = (p: number) => PAD.l + p * INNER;
const yOf = (f: number) => PAD.t + (1 - f) * PLOT;
const rOf = (n: number) => 3 + Math.sqrt(n) * 1.4;

function Reliability2026Diagram() {
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="h-auto w-full"
      role="img"
      aria-label="Reliability diagram for the 2026 World Cup: predicted probability on the x-axis, observed frequency on the y-axis, one bubble per populated bin sized by sample count, with the diagonal marking perfect calibration."
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={xOf(t)} y1={PAD.t} x2={xOf(t)} y2={PAD.t + PLOT} className="stroke-border" strokeWidth={0.5} />
          <line x1={PAD.l} y1={yOf(t)} x2={PAD.l + INNER} y2={yOf(t)} className="stroke-border" strokeWidth={0.5} />
          <text x={xOf(t)} y={SIZE - PAD.b + 12} textAnchor="middle" className="fill-muted text-[8px]">
            {t}
          </text>
          <text x={PAD.l - 6} y={yOf(t) + 3} textAnchor="end" className="fill-muted text-[8px]">
            {t}
          </text>
        </g>
      ))}

      {/* perfect-calibration diagonal */}
      <line
        x1={xOf(0)} y1={yOf(0)} x2={xOf(1)} y2={yOf(1)}
        className="stroke-border-strong" strokeWidth={1} strokeDasharray="4 3"
      />

      {/* points */}
      {RELIABILITY_2026.map((p, i) => (
        <circle
          key={i}
          cx={xOf(p.meanPred)}
          cy={yOf(p.obsFreq)}
          r={rOf(p.n)}
          className={cn(FILL[p.klass], "opacity-70")}
          stroke="var(--surface)"
          strokeWidth={0.75}
        >
          <title>
            {`${CLASS_LABEL[p.klass]}: predicted ${(p.meanPred * 100).toFixed(0)}%, observed ${(p.obsFreq * 100).toFixed(0)}% (n=${p.n})`}
          </title>
        </circle>
      ))}

      {/* axis titles */}
      <text x={PAD.l + INNER / 2} y={SIZE - 2} textAnchor="middle" className="fill-secondary text-[9px] font-medium">
        Predicted probability
      </text>
      <text
        x={10} y={PAD.t + PLOT / 2}
        textAnchor="middle"
        transform={`rotate(-90 10 ${PAD.t + PLOT / 2})`}
        className="fill-secondary text-[9px] font-medium"
      >
        Observed frequency
      </text>
    </svg>
  );
}

/** Dense labelled stat, mirroring ValidationSection's ValFact (same tokens, tabular-nums figure). */
function StatFact({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-subtle p-3">
      <div className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="tnum mt-0.5 font-display text-lg font-semibold text-fg">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-secondary">{sub}</div> : null}
    </div>
  );
}

/** One phase's six-fact panel (group or knockout). */
function PhasePanel({ split }: { split: typeof C.group | typeof C.knockout }) {
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-fg">{split.label}</span>
        <span className="tnum text-xs text-muted">n = {split.n}</span>
      </div>
      <div className="text-xs text-secondary">{split.context}</div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatFact label="Brier" value={split.brier.toFixed(3)} sub={`vs ${C.uniformBrier} uniform`} />
        <StatFact label="Log loss" value={split.logLoss.toFixed(3)} />
        <StatFact label="Top-1" value={`${split.top1Pct}%`} sub="actual outcome called first" />
        <StatFact label="Skill vs uniform" value={`+${split.skillVsUniformPct}%`} sub="Brier skill score" />
        <StatFact label="Skill vs base-rate" value={`+${split.skillVsBaseRatePct}%`} sub="vs climatology" />
        <StatFact label="Matches" value={split.n} sub="clean pre-match run" />
      </div>
    </div>
  );
}

/** Real-tournament calibration section: leads the historical backtest with the WC 2026 result. */
export function TournamentCalibrationSection() {
  return (
    <Card>
      <h3 className="mb-2 text-sm font-semibold text-fg">Was the forecast calibrated? (WC 2026)</h3>
      <p className="text-sm text-secondary">
        The historical backtest earns trust before the tournament; this grades the model on 2026 itself,
        every group and knockout match, nothing omitted.
      </p>
      <p className="mt-2 text-xs text-muted">
        Coverage: <span className="tnum">72 of 72</span> group matches and{" "}
        <span className="tnum">32 of 32</span> knockouts had a clean pre-match run, with{" "}
        <span className="tnum">0</span> omitted.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <PhasePanel split={C.group} />
        <PhasePanel split={C.knockout} />
      </div>

      <p className="mt-3 text-xs text-muted">
        Group figures are identical frozen and live: a group result never depends on another
        group&rsquo;s outcome, so live conditioning did not move them.
      </p>

      <div className="mt-4 rounded-md border border-border bg-surface p-3">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-sm font-semibold text-fg">Reliability, 2026</span>
          <span className="tnum text-xs text-muted">104 matches (group + knockout)</span>
        </div>
        <div className="mx-auto max-w-md">
          <Reliability2026Diagram />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-secondary">
          {(Object.keys(CLASS_LABEL) as OutcomeClass[]).map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <span className={cn("inline-block h-2.5 w-2.5 rounded-full", DOT[k])} />
              {CLASS_LABEL[k]}
            </span>
          ))}
          <span className="ml-auto text-muted">Bubble size reflects the bin sample count, dashed line = perfect calibration</span>
        </div>
        <p className="mt-3 text-xs text-muted">
          Rendered from{" "}
          <a href="/methodology/reliability_2026.csv" className="text-confident hover:underline">reliability_2026.csv</a>.
        </p>
      </div>

      <div className="mt-4 rounded-md border border-down/30 bg-bg-subtle p-3 text-sm text-secondary">
        <strong className="text-fg">Honest read: the reliability is mixed.</strong> The model beats
        both baselines on Brier and sharpens on the knockouts (top-1{" "}
        <span className="tnum font-semibold text-fg">78%</span>), but on the group matches it is only
        modestly better than a uniform guess, and the group max calibration error of{" "}
        <span className="tnum font-semibold text-fg">0.709</span> comes almost entirely from one
        single-match bin (predicted about <span className="tnum">71%</span>, observed{" "}
        <span className="tnum">0%</span> in that lone game).
      </div>

      {/*
        Wave 33 T3. NAMING THE DIRECTION OF THE MISS, which the block above never did.

        Read straight off the bins rendered above, with no fitted line and no estimator, because the
        direction is estimator-dependent and saying "the slope is 1.9" would be a claim about a choice
        of regression rather than about the model. A weighted least-squares slope with an intercept
        gives home 1.67, away 2.26; a ratio of weighted means gives home 1.19, away 0.89. The bins
        themselves are unambiguous and need no such choice, so they are what is quoted.

        The draw class is deliberately NOT given a direction: it has three populated bins and 81 of its
        104 observations sit in one of them, and three reasonable estimators disagree in sign on it.
      */}
      <div className="mt-3 rounded-md border border-down/30 bg-bg-subtle p-3 text-sm text-secondary">
        <strong className="text-fg">Where it missed, it was under-confident, not over-confident.</strong>{" "}
        Its home-win and away-win probabilities sat too close to the middle of the range: outcomes it
        rated below about <span className="tnum">35%</span> happened less often than that, and outcomes
        it rated above about <span className="tnum">44%</span> happened more often, most starkly for
        away wins rated <span className="tnum font-semibold text-fg">54%</span> that went on to occur{" "}
        <span className="tnum font-semibold text-fg">90%</span> of the time. Draws are left out of that
        statement on purpose: three of their bins are populated and{" "}
        <span className="tnum">81</span> of <span className="tnum">104</span> observations fall in one
        of them, which is not enough to give the direction a sign.
      </div>

      <p className="mt-3 text-xs text-muted">
        The champion pick, the exact-final call and the AI vs humans bracket score are on the{" "}
        <Link href="/" className="text-confident hover:underline">home retrospective</Link>.
      </p>
    </Card>
  );
}
