import type { Metadata } from "next";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Section, Fact } from "@/components/methodology/Section";
import { ReliabilityChart } from "@/components/methodology/ReliabilityChart";
import { TournamentCalibrationSection } from "@/components/methodology/TournamentCalibrationSection";
import { ValidationSection } from "@/components/methodology/ValidationSection";
import { simPct } from "@/lib/utils";
import {
  BACKTEST,
  CALIBRATION,
  CHAMPION_TOP12,
  DATA_SOURCE,
  DC_PARAMS,
  ELO_PARAMS,
  ELO_TOP10,
  getReproRun,
  MONTE_CARLO,
  RELIABILITY,
  reproRowsFromRun,
  REPRO_FALLBACK,
  RETRODICTION,
  TUNING,
  UNIFORM_BASELINE,
} from "@/lib/data/methodology";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How the forecast is built: tournament-weighted Elo, a Dixon–Coles goal model with host advantage, Monte Carlo simulation, backtest results with a reliability diagram and baseline comparison, FIFA Article 13 tie-breakers, and a full reproducibility note.",
};

// ISR (Track C static seal). Oracles bounded (freeze.ts + version.ts) and all reads are cookie-free, so
// /methodology renders statically. Live freshness via RESULT_SURFACES revalidatePath + the version-keyed
// Data Cache; reversible via the isFrozen data TTL, no date.
export const revalidate = 3600;

const TOC = [
  ["what", "What it is / isn't"],
  ["data", "Data sources"],
  ["pipeline", "The pipeline"],
  ["elo", "Elo ratings"],
  ["dixon-coles", "Dixon–Coles + host"],
  ["calibration", "Calibration"],
  ["backtest", "Backtest results"],
  ["reliability", "Reliability diagram"],
  ["calibration-2026", "WC 2026 calibration"],
  ["validation", "Validation"],
  ["monte-carlo", "Monte Carlo"],
  ["tiebreakers", "Tie-breakers"],
  ["forecast-reads", "Forecast reads"],
  ["awards", "Player award boards"],
  ["player-projections", "Player projections"],
  ["reproducibility", "Reproducibility"],
  ["limitations", "Limitations"],
  ["cadence", "Update cadence"],
] as const;

export default async function MethodologyPage() {
  // Live read of the published run (current_run); falls back to committed values if unavailable.
  const run = await getReproRun();
  const reproRows = run ? reproRowsFromRun(run) : REPRO_FALLBACK;
  const calibMethod = (run?.calibration_method ?? "none").toLowerCase();
  const calibApplied = calibMethod !== "none" && calibMethod !== "";
  // Published simulation count - live from the run, falling back to the known 50k production value.
  const publishedIters = run?.iterations ?? MONTE_CARLO.publishedIters;
  const publishedItersK = `${Math.round(publishedIters / 1000)}k`;

  return (
    <div className="mx-auto max-w-3xl">
      {/* ── Hero ── */}
      <header className="mb-8">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl font-bold tracking-tight text-fg">Methodology</h1>
          <Tag variant="confident">Probabilistic · calibrated</Tag>
        </div>
        <p className="max-w-prose text-secondary">
          A transparent account of how the forecast is produced: the model, the data it learns
          from, how it scored on past World Cups, and exactly where it stops being certain. The
          brand says &ldquo;Prediction Engine&rdquo;; the claims here say <em>probability</em>. Both
          are true.
        </p>
      </header>

      {/* ── On this page ── */}
      <nav aria-label="On this page" className="mb-10 rounded-card border border-border bg-bg-subtle p-3">
        <div className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">On this page</div>
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
          {TOC.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="text-secondary hover:text-confident hover:underline">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-12">
        {/* ── 00 What it is / isn't ── */}
        <Section
          id="what"
          index={0}
          title="What this model is, and is not"
          lede="An honest frame before any numbers. A disclosed limitation is a feature in a forecast, not a flaw."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <Card className="border-up/30">
              <h3 className="mb-2 text-sm font-semibold text-up">It is</h3>
              <ul className="space-y-1.5 text-sm text-secondary">
                <li>A statistical model of international football: strength ratings → a goal model → simulated tournaments.</li>
                <li>Calibrated and backtested on the 2018 and 2022 World Cups before being trusted on 2026.</li>
                <li>Fully reproducible: fixed data hash, fixed RNG seed, versioned code.</li>
                <li>Independent. Built from public match results only.</li>
              </ul>
            </Card>
            <Card className="border-down/30">
              <h3 className="mb-2 text-sm font-semibold text-down">It is not</h3>
              <ul className="space-y-1.5 text-sm text-secondary">
                <li>An oracle. A 7% champion probability means roughly a 1-in-14 shot, not a prediction the team wins.</li>
                <li>A betting product. It uses <strong>no</strong> market or odds data, by design.</li>
                <li>Injury/lineup/transfer-aware in real time: it sees results, not team news.</li>
                <li>Affiliated with FIFA or any official body.</li>
              </ul>
            </Card>
          </div>
        </Section>

        {/* ── 01 Data sources ── */}
        <Section
          id="data"
          index={1}
          title="Data sources"
          lede="One public dataset of international results, cleaned and tournament-weighted. No market data, no scraped odds."
        >
          <Card>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <a href={DATA_SOURCE.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-confident hover:underline">
                {DATA_SOURCE.name}
              </a>
              <span className="tnum text-xs text-muted">latest match {DATA_SOURCE.latestMatch}</span>
            </div>
            <p className="mt-2 text-sm text-secondary">
              Every full international since the 19th century. After cleaning (dropping unplayed and
              unparseable rows), <span className="tnum font-semibold text-fg">{DATA_SOURCE.cleanRows.toLocaleString()}</span>{" "}
              matches feed the model. Each match carries a <strong>competition tier</strong> (a World
              Cup final counts for more than a friendly), and the exact tier weights were tuned on the
              backtest (below).
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
              {Object.entries(DATA_SOURCE.byTier).map(([tier, count]) => (
                <Fact key={tier} label={`Tier ${tier}`} value={count.toLocaleString()} />
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              Source pinned by SHA-256 <span className="tnum break-all">{DATA_SOURCE.sha256.slice(0, 16)}…</span>. See the reproducibility note.
            </p>
          </Card>
        </Section>

        {/* ── 02 Pipeline ── */}
        <Section
          id="pipeline"
          index={2}
          title="The pipeline"
          lede="Three stages turn historical results into a champion probability for all 48 teams."
        >
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ["1 · Elo", "Tournament-weighted strength rating per team, updated match by match.", "elo"],
              ["2 · Dixon–Coles", "A goal model: turns ratings into a scoreline distribution for any fixture.", "dixon-coles"],
              ["3 · Monte Carlo", "Simulates the whole tournament tens of thousands of times.", "monte-carlo"],
            ].map(([title, body, href]) => (
              <a key={href} href={`#${href}`} className="group rounded-card border border-border bg-surface p-4 transition-colors hover:border-confident">
                <div className="font-display text-sm font-bold text-fg group-hover:text-confident">{title}</div>
                <p className="mt-1 text-xs text-secondary">{body}</p>
              </a>
            ))}
          </div>
        </Section>

        {/* ── 03 Elo ── */}
        <Section
          id="elo"
          index={3}
          title="Elo ratings"
          lede="Standard international-football Elo (the eloratings.net tradition), with two domain-specific refinements: competition-tier weighting and an altitude correction."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Fact label="Base K-factor" value={ELO_PARAMS.baseK} />
            <Fact label="Home advantage" value={`+${ELO_PARAMS.homeAdvElo}`} sub="Elo points, non-neutral" />
            <Fact label="Margin multiplier" value="ln" sub={ELO_PARAMS.gdMultiplier} />
            <Fact label="Initial rating" value={ELO_PARAMS.initial} />
          </div>
          <Card className="mt-3">
            <p className="text-sm text-secondary">
              The update per match scales with the competition tier and the goal margin. An{" "}
              <strong>altitude correction</strong> stops high-altitude home wins (Quito, La Paz,
              Bogotá) from inflating ratings: a sea-level side visiting altitude is already expected to
              do worse, so beating them earns a smaller rating gain. Tier weights, tuned on the backtest:
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(ELO_PARAMS.tierWeights).map(([tier, w]) => (
                <span key={tier} className="tnum rounded-md border border-border bg-bg-subtle px-2.5 py-1 text-xs text-secondary">
                  Tier {tier} <span className="font-semibold text-fg">×{w}</span>
                </span>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted">
              Final-refit top of the table:{" "}
              <span className="text-secondary">{ELO_TOP10.slice(0, 6).join(" · ")} · …</span>
              {" "}(Ecuador sits #16 and Bolivia #84, a sign the altitude fix holds).
            </p>
          </Card>
        </Section>

        {/* ── 04 Dixon–Coles ── */}
        <Section
          id="dixon-coles"
          index={4}
          title="Dixon–Coles goal model + host advantage"
          lede="Elo says who is stronger; Dixon–Coles turns that into goals. It models each side's expected goals as Poisson rates with a low-score correction, and fits one shared host-advantage term."
        >
          <Card>
            <p className="text-sm text-secondary">
              For a match between teams <em>i</em> and <em>j</em>, the log goal rates are{" "}
              <code className="tnum rounded bg-bg-subtle px-1 text-xs">log λ = c + attack₍ᵢ₎ − defense₍ⱼ₎ + h·home₍ᵢ₎ − altitude·burden₍ᵢ₎</code>.
              The Dixon–Coles τ correction fixes the well-known under-counting of 0-0, 1-0, 0-1 and 1-1
              scorelines. An <strong>Elo prior</strong> pulls each team&rsquo;s attack/defense toward its
              rating-implied strength, and the fit is time-weighted (recent matches count more).
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Fact label="Intercept c" value={DC_PARAMS.interceptC} sub="league goal rate" />
              <Fact label="Host adv. h" value={`+${DC_PARAMS.homeAdvantage}`} sub="log-goal coefficient" />
              <Fact label="Altitude coef" value={DC_PARAMS.altitudeCoef} sub="visitor goal penalty" />
              <Fact label="ρ (low-score)" value={DC_PARAMS.rho} sub="Dixon–Coles τ" />
            </div>
            <p className="mt-3 text-sm text-secondary">
              <strong>Host advantage.</strong> A single coefficient (<span className="tnum">h = +{DC_PARAMS.homeAdvantage}</span>)
              lifts the home/host side&rsquo;s goal rate. For 2026 it applies to the three hosts (USA,
              Mexico, Canada) on their genuine home fixtures; it is discounted at neutral World Cup
              venues, and the altitude term handles Mexico City&rsquo;s elevation separately.
            </p>
            <p className="mt-2 text-xs text-muted">
              Fit on data from {DC_PARAMS.fitMinDate}, 4-year half-life ({DC_PARAMS.halfLifeDays} days),
              Elo-prior strength {DC_PARAMS.lambdaPrior}. Training cutoff {DC_PARAMS.trainingCutoff}.
            </p>
          </Card>
        </Section>

        {/* ── 05 Calibration ── */}
        <Section
          id="calibration"
          index={5}
          title="Calibration"
          lede="Calibration was assessed, not assumed. We tested whether a post-hoc map would improve the probabilities before deciding what the published run carries."
        >
          <Card>
            <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-bg-subtle p-3">
              <span className="text-xs font-medium tracking-wide text-muted uppercase">Published run</span>
              <span className="text-sm text-secondary">calibration method</span>
              <Tag variant={calibApplied ? "confident" : "up"}>
                {calibMethod === "none" ? "none (checked, adequate)" : calibMethod}
              </Tag>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">Method</th>
                    <th className="py-2 pr-3 text-right font-medium">2018 ΔBrier</th>
                    <th className="py-2 pr-3 text-right font-medium">2022 ΔBrier</th>
                    <th className="py-2 pr-3 font-medium">Log loss</th>
                    <th className="py-2 font-medium">Verdict</th>
                  </tr>
                </thead>
                <tbody>
                  {CALIBRATION.map((c) => (
                    <tr key={c.method} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium text-fg capitalize">{c.method}</td>
                      <td className="tnum py-2 pr-3 text-right text-secondary">{c.brier2018Pct > 0 ? "+" : ""}{c.brier2018Pct}%</td>
                      <td className={`tnum py-2 pr-3 text-right ${c.brier2022Pct > 1 ? "text-down" : "text-secondary"}`}>
                        {c.brier2022Pct > 0 ? "+" : ""}{c.brier2022Pct}%
                      </td>
                      <td className="py-2 pr-3 text-secondary">{c.logLossNote}</td>
                      <td className="py-2 text-secondary">{c.verdict}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-secondary">
              {calibApplied ? (
                <>
                  <strong className="text-fg">Assessed finding: a <span className="capitalize">{calibMethod}</span> map is applied.</strong>{" "}
                  It earned its place on the backtest, and the published run records{" "}
                  <span className="tnum">calibration_method = {calibMethod}</span>.
                </>
              ) : (
                <>
                  <strong className="text-fg">Assessed finding: adequate as-is, no map applied.</strong>{" "}
                  Isotonic regression overfits the small World Cup window (+2.3% Brier on 2022); Platt
                  scaling is net-neutral on Brier and degrades log loss. The raw model is acceptably
                  calibrated (visible in the reliability diagram below), so the published run records{" "}
                  <span className="tnum">calibration_method = none</span>. This is a checked-and-adequate
                  result, recorded with its evidence, not an omission.
                </>
              )}
            </p>
          </Card>
        </Section>

        {/* ── 06 Backtest ── */}
        <Section
          id="backtest"
          index={6}
          title="Backtest results"
          lede="The model was refit strictly before each past World Cup opener (no leakage), then scored on the matches that followed. Tuning happened on 2022; 2018 was held out."
        >
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">World Cup</th>
                    <th className="py-2 pr-3 text-right font-medium">Brier</th>
                    <th className="py-2 pr-3 text-right font-medium">Log loss</th>
                    <th className="py-2 pr-3 text-right font-medium">Baseline Brier</th>
                    <th className="py-2 pr-3 text-right font-medium">ΔBrier</th>
                    <th className="py-2 font-medium">Gate</th>
                  </tr>
                </thead>
                <tbody>
                  {BACKTEST.map((b) => (
                    <tr key={b.year} className="border-b border-border/60">
                      <td className="py-2 pr-3 font-medium text-fg">
                        {b.year} <span className="text-xs font-normal text-muted">({b.held})</span>
                      </td>
                      <td className="tnum py-2 pr-3 text-right font-semibold text-fg">{b.dcBrier.toFixed(4)}</td>
                      <td className="tnum py-2 pr-3 text-right text-secondary">{b.dcLogLoss.toFixed(4)}</td>
                      <td className="tnum py-2 pr-3 text-right text-secondary">{b.baseBrier.toFixed(4)}</td>
                      <td className="tnum py-2 pr-3 text-right text-secondary">+{b.deltaBrier.toFixed(4)} <span className="text-muted">({b.deltaSigma}σ)</span></td>
                      <td className="py-2">
                        <Tag variant={b.withinOneSigma ? "up" : "down"}>{b.withinOneSigma ? "within 1σ ✓" : "fail"}</Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-sm text-secondary">
              Both years beat a uniform <span className="tnum">(⅓, ⅓, ⅓)</span> model comfortably
              (Brier <span className="tnum">{UNIFORM_BASELINE.brier}</span> / log loss{" "}
              <span className="tnum">{UNIFORM_BASELINE.logLoss}</span>). The comparison column is an{" "}
              <strong>Elo-logistic baseline</strong> on the same information.
            </p>
            <div className="mt-3 rounded-md border border-confident/25 bg-confident/5 p-3 text-sm text-secondary">
              <strong className="text-fg">On the gate.</strong> A calibrated logistic on the same Elo
              signal is a very strong win/draw/loss baseline, but the simulator needs Dixon–Coles&rsquo;s{" "}
              <em>scoreline</em> structure (exact scores, extra time, penalties, goal-difference
              tie-breaks) that a W/D/L classifier simply cannot produce. So the gate is set to
              detect <em>brokenness</em>, not to pick a winner for the same job: Dixon–Coles must land{" "}
              <strong>within 1σ of the baseline on Brier</strong> each year. Both clear it
              comfortably (0.48σ and 0.35σ), and the tuned config <em>improved</em> held-out 2018.
            </div>
          </Card>

          {/* tuning trajectory */}
          <details className="mt-3 rounded-card border border-border bg-surface p-4">
            <summary className="cursor-pointer text-sm font-semibold text-fg">2022 tuning trajectory (8 steps)</summary>
            <p className="mt-2 text-xs text-secondary">
              Coordinate descent on a combined Brier/log-loss objective normalised to the default
              config. The data preferred a <strong>longer half-life</strong> and a <strong>stronger Elo
              prior</strong>: the hypothesis for why traditional powers were under-rated.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="py-1.5 pr-3 font-medium">Step (knob moved)</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Loss</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Brier</th>
                    <th className="py-1.5 text-right font-medium">Log loss</th>
                  </tr>
                </thead>
                <tbody>
                  {TUNING.map((s, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-1.5 pr-3 text-secondary">{s.knob}</td>
                      <td className="tnum py-1.5 pr-3 text-right text-secondary">{s.loss.toFixed(4)}</td>
                      <td className="tnum py-1.5 pr-3 text-right text-secondary">{s.brier.toFixed(4)}</td>
                      <td className="tnum py-1.5 text-right text-secondary">{s.logLoss.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          {/* in-tournament retrodiction */}
          <details className="mt-3 rounded-card border border-border bg-surface p-4">
            <summary className="cursor-pointer text-sm font-semibold text-fg">
              In-tournament retrodiction (does updating mid-tournament help?)
            </summary>
            <p className="mt-2 text-xs text-secondary">
              A stricter test: instead of freezing the model before the opener, we replayed
              WC2022 match by match, refitting before every one of the{" "}
              <span className="tnum">{RETRODICTION.n}</span> games on all data strictly before it,
              including the earlier WC2022 results as they happened. The honest finding is that
              in-tournament updating did <strong>not</strong> improve the probabilistic scores: the
              static pre-tournament fit was slightly better on Brier and log loss.
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[26rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="py-1.5 pr-3 font-medium">Fit</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Brier</th>
                    <th className="py-1.5 pr-3 text-right font-medium">Log loss</th>
                    <th className="py-1.5 pr-3 text-right font-medium">MAE</th>
                    <th className="py-1.5 text-right font-medium">Top-1 / Top-2</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border/50">
                    <td className="py-1.5 pr-3 text-secondary">Walk-forward (updating)</td>
                    <td className="tnum py-1.5 pr-3 text-right text-secondary">{RETRODICTION.brier.toFixed(4)}</td>
                    <td className="tnum py-1.5 pr-3 text-right text-secondary">{RETRODICTION.logLoss.toFixed(4)}</td>
                    <td className="tnum py-1.5 pr-3 text-right text-secondary">{RETRODICTION.mae.toFixed(4)}</td>
                    <td className="tnum py-1.5 text-right text-secondary">{RETRODICTION.top1.toFixed(2)} / {RETRODICTION.top2.toFixed(2)}</td>
                  </tr>
                  <tr className="border-b border-border/50">
                    <td className="py-1.5 pr-3 text-secondary">Static (pre-tournament)</td>
                    <td className="tnum py-1.5 pr-3 text-right font-semibold text-fg">{RETRODICTION.staticBrier.toFixed(4)}</td>
                    <td className="tnum py-1.5 pr-3 text-right font-semibold text-fg">{RETRODICTION.staticLogLoss.toFixed(4)}</td>
                    <td className="tnum py-1.5 pr-3 text-right text-muted">n/a</td>
                    <td className="tnum py-1.5 text-right text-muted">n/a</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-secondary">
              The pre-tournament strength ordering still tracked the eventual finish well
              (Spearman <span className="tnum">{RETRODICTION.spearman.toFixed(2)}</span> between
              each team&rsquo;s pre-tournament strength and its final placing). With a 4-year
              half-life and a strong long-run prior, ~60 noisy tournament matches barely move the
              fit. By design, the model trusts established strength over a three-week hot streak.
            </p>
          </details>
        </Section>

        {/* ── 07 Reliability ── */}
        <Section
          id="reliability"
          index={7}
          title="Reliability diagram"
          lede="Calibration, drawn. For each predicted-probability bin, where does the model land versus how often the outcome actually happened? Points on the dashed diagonal are perfectly calibrated."
        >
          <Card>
            <ReliabilityChart points={RELIABILITY} />
            <p className="mt-4 text-sm text-secondary">
              With only ~64 matches per World Cup the bins are sparse: large bubbles carry the signal,
              small ones are noise-dominated, so read the diagram by bubble size. The points hug the
              diagonal without a systematic over- or under-confidence bias, which is why no calibration
              map was applied.
            </p>
            <p className="mt-2 text-xs text-muted">
              Rendered from{" "}
              <a href="/methodology/reliability_2018.csv" className="text-confident hover:underline">reliability_2018.csv</a>{" "}/{" "}
              <a href="/methodology/reliability_2022.csv" className="text-confident hover:underline">reliability_2022.csv</a>.
            </p>
          </Card>
        </Section>

        {/* ── 08 WC 2026 calibration (real-tournament result, leads the historical backtest) ── */}
        <Section
          id="calibration-2026"
          index={8}
          title="Was the forecast calibrated on WC 2026?"
          lede="Before the historical backtest below: the model's own probabilities, scored against what actually happened across the whole 2026 tournament. Full coverage, nothing omitted, the unflattering parts reported."
        >
          <TournamentCalibrationSection />
        </Section>

        {/* ── 09 Validation ── */}
        <Section
          id="validation"
          index={9}
          title="Validation: did it pick the winner?"
          lede="The match scores tell you the model is calibrated; this asks the harder question. Refit strictly before each past World Cup, how did it rate the team that actually won, and did it converge on that team as the bracket played out? All figures are bound to the committed backtest artifacts."
        >
          <ValidationSection />
        </Section>

        {/* ── 10 Monte Carlo ── */}
        <Section
          id="monte-carlo"
          index={10}
          title="Monte Carlo simulation"
          lede="To get tournament odds, the engine plays the whole World Cup tens of thousands of times (group stage through final), sampling each match from its Dixon–Coles scoreline distribution."
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Fact label="RNG seed" value={MONTE_CARLO.seed} sub="fixed → reproducible" />
            <Fact label="Published run" value={publishedItersK} sub="simulations" />
            <Fact label="Convergence check" value="10k ↔ 50k" sub="champion-share drift" />
            <Fact label="Max drift" value={`${MONTE_CARLO.maxDeltaPp}pp`} sub={`on ${MONTE_CARLO.maxDeltaTeam}, vs 50k`} />
          </div>
          <Card className="mt-3">
            <p className="text-sm text-secondary">
              Each simulated tournament resolves group standings (with the full tie-breaker chain
              below), selects the eight best third-placed teams, fills the knockout bracket via the
              official slotting matrix, and plays to a champion. Aggregating across runs gives every
              team&rsquo;s probability of reaching each stage. A convergence check comparing{" "}
              <span className="tnum">10k</span> and <span className="tnum">50k</span> simulations found
              the largest champion-share drift was <span className="tnum">{MONTE_CARLO.maxDeltaPp}pp</span>{" "}
              (on {MONTE_CARLO.maxDeltaTeam}), just above the{" "}
              <span className="tnum">{MONTE_CARLO.convergenceTargetPp}pp</span> target, driven by noise in
              the 10k arm. The published forecast therefore runs at{" "}
              <span className="tnum">{publishedIters.toLocaleString()}</span> simulations.
            </p>
            <div className="mt-4">
              <div className="mb-2 text-[11px] font-semibold tracking-wide text-muted uppercase">
                Champion probability: top 12 (illustrative 10k run)
              </div>
              <ul className="space-y-1.5">
                {CHAMPION_TOP12.map((c) => (
                  <li key={c.team} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-sm text-fg">{c.team}</span>
                    <span className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                      <span className="block h-full rounded-full bg-confident" style={{ width: `${(c.champion / CHAMPION_TOP12[0].champion) * 100}%` }} />
                    </span>
                    <span className="tnum w-12 shrink-0 text-right text-xs font-medium text-secondary">{simPct(c.champion)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted">
                Snapshot of a backtest-acceptance run; the live numbers are on the{" "}
                <Link href="/forecast" className="text-confident hover:underline">forecast</Link> page.
              </p>
            </div>
          </Card>
        </Section>

        {/* ── 11 Tie-breakers ── */}
        <Section
          id="tiebreakers"
          index={11}
          title="Group tie-breakers: FIFA Article 13"
          lede="The simulator implements the official 2026 tie-breaker chain in full. Getting the order right matters: it changes which third-placed teams qualify, and therefore the knockout bracket."
        >
          <Card>
            <ol className="space-y-2 text-sm text-secondary">
              {[
                ["1a–1c", "Head-to-head first, among the tied teams only: points, then goal difference, then goals scored."],
                ["re-apply", "If head-to-head separates some but not all, re-apply 1a–1c to the teams still tied (the step does not restart from scratch)."],
                ["2d–2e", "Overall goal difference, then overall goals scored across all group matches."],
                ["3g", "Most recent FIFA / Coca-Cola Men's World Ranking: FIFA's official terminal step."],
              ].map(([id, text]) => (
                <li key={id} className="flex gap-3">
                  <span className="tnum mt-0.5 w-14 shrink-0 rounded bg-bg-subtle px-1.5 py-0.5 text-center text-xs font-semibold text-confident">{id}</span>
                  <span>{text}</span>
                </li>
              ))}
            </ol>
            <div className="mt-4 rounded-md border border-upset/30 bg-upset-bg/40 p-3 text-sm text-secondary">
              <strong className="text-fg">Disclosure.</strong> The simulator implements FIFA Article 13
              in full through overall goals scored. Beyond that, since it does not model
              card/disciplinary events, ties are broken using the team&rsquo;s pre-tournament FIFA
              Ranking: the <strong className="text-fg">1 April 2026</strong> edition, the locked
              launch ranking (FIFA&rsquo;s official terminal step). <strong>Drawing of lots is not used</strong>;
              FIFA does not use it for 2026. In practice, ties surviving past overall goals scored occur
              in well under 1% of simulated group instances and have a negligible effect on aggregate
              probabilities. The pre-tournament FIFA Ranking is a deterministic, reproducible stand-in for
              the seeded-draw approximation an earlier plan had used.
            </div>
            <p className="mt-3 text-xs text-muted">
              For the best-8 third-placed ranking across groups the chain is identical except
              head-to-head is skipped (those teams have not played each other): points → overall GD →
              overall GS → FIFA Ranking.
            </p>
          </Card>
        </Section>

        {/* ── 12 Forecast reads ── */}
        <Section
          id="forecast-reads"
          index={12}
          title="Reading the forecast"
          lede="What each number on the forecast, groups and team pages actually represents, and how the honest insight reads are derived. These definitions live here so the pages themselves can stay to the numbers."
        >
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-fg">Stage probabilities</h3>
            <p className="text-sm text-secondary">
              On the forecast page, on each team profile and in the title race, every figure
              (champion, finalist, semi-finalist, quarter-finalist, group qualification) is the{" "}
              <strong className="text-fg">share of Monte Carlo simulations</strong> in which the team
              reaches that stage. Bars on the forecast chart are scaled to the leader for comparison;
              the percentage shown is the model&rsquo;s absolute title odds, not a relative figure.
            </p>
          </Card>
          <Card className="mt-3">
            <h3 className="mb-2 text-sm font-semibold text-fg">Title-race movement</h3>
            <p className="text-sm text-secondary">
              The home leaderboard ranks teams by title probability and shows movement against the
              previous run (the same pre-matchday run the daily briefing recaps against): rank up reads
              green, rank down reads red, and an unchanged rank still carries a green or red chip when
              the odds moved without the rank changing. Before any prior run exists, rows render without
              deltas.
            </p>
          </Card>
          <Card className="mt-3">
            <h3 className="mb-2 text-sm font-semibold text-fg">Dark horses and overvalued teams</h3>
            <p className="text-sm text-secondary">
              Both cards first split the field on a <strong className="text-fg">frozen elite tier</strong>:
              the pre-tournament top 12 teams by the model&rsquo;s frozen champion odds, ordered by a
              deterministic total order (champion odds, then finalist odds, then FIFA rank, then team
              name, so no two teams share a rank; a team with no champion odds sorts to the bottom and is
              never elite). The tier is fixed before kickoff and never flexes as teams are eliminated.
            </p>
            <p className="mt-3 text-sm text-secondary">
              <strong className="text-fg">Dark horses</strong> are the teams from{" "}
              <strong className="text-fg">outside</strong> that top 12 whose ACTUAL run most beat their
              frozen odds, ranked by the <strong className="text-fg">surprise index</strong>. The index
              blends a stage term (the negative log-probability the frozen baseline gave the deepest stage
              the team really reached, from results, not a live probability) with a match term (the mean,
              over the team&rsquo;s played matches, of points banked minus the points the last pre-kickoff
              run expected), weighted 60/40 and normalized across the field. Restricting the pool to teams
              outside the top 12 is what keeps a pre-tournament favourite off the board no matter how deep
              it runs; a genuine unfancied over-performer takes its place. It is{" "}
              <strong className="text-fg">sticky</strong>: elimination never removes a team, so an
              over-performer that goes out still stands. Hosts are not excluded, because the frozen
              baseline already prices in home advantage, so a host that over-performs is beating its own
              elevated bar.
            </p>
            <p className="mt-3 text-sm text-secondary">
              <strong className="text-fg">Overvalued</strong> teams are the mirror, restricted to{" "}
              <strong className="text-fg">inside</strong> the top 12: a favourite the result did not back,
              ranked by FIFA-rank percentile minus achieved-outcome percentile. A low-rated team that
              exits early is never flagged here, because it was never a favourite. If too few of the top
              12 have fallen short to fill the card, the eligibility margin slides to the best-available
              under-performers within that same top 12, so the card stays populated and honest rather than
              blank.
            </p>
          </Card>
          <Card className="mt-3">
            <h3 className="mb-2 text-sm font-semibold text-fg">Group standings</h3>
            <p className="text-sm text-secondary">
              Before kickoff, group tables show the model&rsquo;s most-likely finishing order with
              qualification odds. As results are entered the tables switch to live standings computed
              from those results via FIFA Article 13 (above), provisional until each group&rsquo;s three
              matchdays are complete, then to final. The best-eight third-placed board ranks by the
              model&rsquo;s best-third probability until results exist, then by the third-place chain
              (points, overall goal difference, overall goals scored, conduct, FIFA Ranking);
              head-to-head is skipped because thirds from different groups have not met. The top eight
              of the twelve advance to the Round of 32.
            </p>
          </Card>
          <Card className="mt-3">
            <h3 className="mb-2 text-sm font-semibold text-fg">Projected bracket</h3>
            <p className="text-sm text-secondary">
              The bracket on the predict page is the model&rsquo;s{" "}
              <strong className="text-fg">single most-likely</strong> arrangement: each slot shows its
              most-probable occupant and the win, draw or loss for that hypothetical tie. It is{" "}
              <strong className="text-fg">not</strong> a claim that each game plays out that way. As
              real results are entered, slots resolve to the actual qualified teams and the bracket
              re-projects from there. The dashed outline marks a still-projected slot; the gold ring
              traces the projected champion&rsquo;s path.
            </p>
          </Card>
        </Section>

        {/* ── 13 Player award boards ── */}
        <Section
          id="awards"
          index={13}
          title="Player award boards"
          lede="The four award races on the players page. Two are honest current leaderboards of what has actually happened; two are the model's pick. Each board's reasoning lives here, not on the cards."
        >
          <Card>
            <h3 className="mb-2 text-sm font-semibold text-gold-strong">Golden Boot</h3>
            <p className="text-sm text-secondary">
              An honest <strong className="text-fg">current leaderboard</strong>, ranked by actual
              goals scored so far, with the model&rsquo;s expected total shown alongside. The board
              metric is expected goals, so a cross-role scorer (for example a midfielder who has scored)
              shows their expected goals here, not their role headline, and keeps their value inside its
              own expected-goals band.
            </p>
          </Card>
          <Card className="mt-3">
            <h3 className="mb-2 text-sm font-semibold text-gold-strong">Playmaker</h3>
            <p className="text-sm text-secondary">
              The assist equivalent: a current leaderboard ranked by actual assists so far, with the
              model&rsquo;s expected total alongside. Only players with at least one real assist appear.
              As with the boot, the board metric is expected assists, so a cross-role assister (a
              defender or forward) shows their expected assists rather than their role headline.
            </p>
          </Card>
          <Card className="mt-3">
            <h3 className="mb-2 text-sm font-semibold text-gold-strong">Golden Glove</h3>
            <p className="text-sm text-secondary">
              The model&rsquo;s keeper pick, ranked on individual shot-stopping quality: save
              percentage and goals-prevented percentiles within keepers, with the keeper&rsquo;s team
              run only a secondary tilt.
            </p>
          </Card>
          <Card className="mt-3">
            <h3 className="mb-2 text-sm font-semibold text-gold-strong">Player of the Tournament</h3>
            <p className="text-sm text-secondary">
              The model&rsquo;s pick, a cross-role contribution percentile weighted by the
              player&rsquo;s team&rsquo;s title and deep-run odds.
            </p>
            <div className="mt-3 rounded-md border border-gold-line/40 bg-bg-subtle p-3 text-sm text-secondary">
              <strong className="text-fg">A caveat.</strong> Player of the Tournament is the{" "}
              <strong className="text-fg">noisiest, least reliable board</strong>: it blends
              contributions across very different roles and leans on team odds, so it is the
              model&rsquo;s current pick, not a prophecy. Read it as a talking point, not a forecast.
            </div>
          </Card>
        </Section>

        {/* ── 14 Player projections ── */}
        <Section
          id="player-projections"
          index={14}
          title="Player projections"
          lede="How the per-player numbers on the players index and profile pages are built, and what the goal split and percentile context mean."
        >
          <Card>
            <p className="text-sm text-secondary">
              Player projections are probabilistic expectations, not predictions of certainty. They
              come from a pre-tournament statistical baseline, scaled by the team&rsquo;s expected
              tournament run, and shift as results are recorded and the model re-runs. Actuals accrue
              per played match. A player tracked for live output but without a pre-tournament baseline
              shows <strong className="text-fg">actuals only</strong>; no projection is fabricated.
            </p>
          </Card>
          <Card className="mt-3">
            <h3 className="mb-2 text-sm font-semibold text-fg">The goal split</h3>
            <p className="text-sm text-secondary">
              For forwards and midfielders the expected goals headline is split into open-play and
              penalty contributions. Open-play goals come from non-penalty xG scaled by a{" "}
              <strong className="text-fg">finishing factor</strong> (an open-play goals-versus-xG
              conversion skill): above 1.0 the player historically out-finishes their xG, around 1.0 is
              neutral, below 1.0 they under-finish. Where no separate finishing skill is projected,
              open-play goals are derived directly from non-penalty xG.
            </p>
          </Card>
          <Card className="mt-3">
            <h3 className="mb-2 text-sm font-semibold text-fg">Index display and percentiles</h3>
            <p className="text-sm text-secondary">
              The players index shows each player&rsquo;s strongest actual contribution (goals for a
              scorer, assists for a creator, clean sheets for a goalless keeper) against the matching
              expected, so a scorer is never hidden behind a zero role headline; the colour tier always
              compares the shown actual to its matching expected, never goals to expected assists. The
              per-position boards rank by a role rating that blends each player&rsquo;s projected output
              with how they grade per-90 against peers in their position. On a profile, positional
              percentiles show where a player ranks among others of the same role on the baseline
              metrics (higher is better).
            </p>
          </Card>
          <Card className="mt-3">
            <h3 className="mb-2 text-sm font-semibold text-fg">Eliminated players: the frozen now</h3>
            <p className="text-sm text-secondary">
              On the pre-tournament expectations card, the &ldquo;now&rdquo; column is a full-tournament
              projection that re-projects as results come in. Once a player&rsquo;s team is eliminated he
              plays no more matches, so a correct full-tournament projection collapses to what he actually
              produced. We enforce that directly: an eliminated player&rsquo;s now is frozen to his
              as-played value, the sum of his played-match expected goals and assists. Because that value
              is built from recorded actuals rather than a model output, it cannot move on a later run and
              can never rise, so a knocked-out player&rsquo;s number stops drifting upward the moment he is
              out.
            </p>
            <p className="mt-2 text-sm text-secondary">
              Elimination is read from results, never from a probability: a team is out when it has lost a
              knockout match (penalties included) or its group is complete and it did not advance. Until
              one of those is true the team stays live and its now keeps re-projecting, and a team we
              cannot map is left live rather than frozen. An eliminated row is muted and carries an OUT
              badge with the stage it exited (for example OUT R16); the number stays labelled as a
              projection, distinct from actual goals, and its delta reads as the as-played value against
              the full-tournament projection.
            </p>
          </Card>
        </Section>

        {/* ── 15 Reproducibility ── */}
        <Section
          id="reproducibility"
          index={15}
          title="Reproducibility"
          lede="Every prediction run records a 10-field provenance block, so any published forecast can be traced to the exact model, code, data, and random seed that produced it."
        >
          <Card>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold tracking-wide text-muted uppercase">Current run</span>
              {run ? (
                <code className="tnum rounded bg-bg-subtle px-1.5 py-0.5 text-xs text-secondary">{run.run_id}</code>
              ) : (
                <Tag variant="neutral">committed artifacts (live run unavailable)</Tag>
              )}
              {run ? <Tag variant="up">live</Tag> : null}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[30rem] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">Field</th>
                    <th className="py-2 pr-3 font-medium">Value</th>
                    <th className="py-2 font-medium">What it pins</th>
                  </tr>
                </thead>
                <tbody>
                  {reproRows.map((r) => (
                    <tr key={r.field} className="border-b border-border/60 align-top">
                      <td className="tnum py-2 pr-3 font-medium text-fg">{r.field}</td>
                      <td className="tnum py-2 pr-3 whitespace-nowrap text-secondary">
                        {r.value ?? <span className="text-muted italic">{r.field === "data_cutoff_time" ? "pending (pre-tournament)" : "set at publish"}</span>}
                      </td>
                      <td className="py-2 text-secondary">{r.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted">
              {run
                ? "Read live from the published forecast run (the current_run view), the same source the forecast page uses, so it refreshes at every re-run."
                : "The published run could not be read here, so values come from the committed model artifacts; model/simulator versions and the data-cutoff time are stamped on the published run."}
            </p>
          </Card>
        </Section>

        {/* ── 16 Limitations ── */}
        <Section
          id="limitations"
          index={16}
          title="Limitations"
          lede="Where the model is weakest, stated plainly."
        >
          <Card>
            <ul className="space-y-2 text-sm text-secondary">
              <li><strong className="text-fg">No team news.</strong> Injuries, suspensions, lineups and form within a camp are invisible to it: it sees match results, not who is on the pitch.</li>
              <li><strong className="text-fg">No market signal.</strong> By design it ignores betting odds, so its champion shares are more compressed than the market&rsquo;s (favourites land near 7–10%, not 12–15%).</li>
              <li><strong className="text-fg">Sparse World Cup evidence.</strong> Only two tournaments (128 matches) back the calibration; reliability bins are noisy and a single tournament cannot fully validate tail behaviour.</li>
              <li><strong className="text-fg">Grid-boundary tuning.</strong> Half-life and the Elo prior both landed at the top of their search grids: the true optimum may sit beyond, suggesting even more weight on long-run strength.</li>
              <li><strong className="text-fg">Static within a day.</strong> The forecast updates when results are entered, not continuously; between updates it does not react to news.</li>
            </ul>
          </Card>
        </Section>

        {/* ── 17 Update cadence ── */}
        <Section
          id="cadence"
          index={17}
          title="Update cadence"
          lede="When the numbers move, and why."
        >
          <Card>
            <ul className="space-y-2 text-sm text-secondary">
              <li><strong className="text-fg">Pre-tournament.</strong> A final model re-run on the June 10 data freeze sets the published opening forecast, superseding any earlier provisional run.</li>
              <li><strong className="text-fg">During the tournament.</strong> As each result is entered, the simulator re-conditions on completed matches and re-runs, so standings and championship odds shift to reflect what has actually happened.</li>
              <li><strong className="text-fg">Provenance preserved.</strong> Each re-run writes a fresh reproducibility block (above), so any past state of the forecast remains traceable.</li>
            </ul>
          </Card>
        </Section>
      </div>

      <p className="mt-12 border-t border-border pt-6 text-xs text-muted">
        Independent, calibrated, and probabilistic: not affiliated with FIFA, and not betting advice.
        Model figures are transcribed from the committed artifacts (backtest report, Dixon–Coles
        parameters, reliability CSVs); the reproducibility block and calibration status are read live
        from the published forecast run.
      </p>
    </div>
  );
}
