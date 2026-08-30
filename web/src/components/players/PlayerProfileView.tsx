import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { teamSlug } from "@/lib/teamSlug";
import { cn } from "@/lib/utils";
import {
  accruedActual, fmtMetric, matchLabel, metricLabel, presentRoleMetrics,
  roleLabel, roleTagVariant, sourceLabel, subRoleLabel,
} from "@/lib/players";
import { TrajectoryChart, type TrajectoryPoint } from "@/components/players/TrajectoryChart";
import { ProjectionStamp } from "@/components/players/ProjectionStamp";
import type { PlayerProfile, PlayerProjection, ProjectionMeta } from "@/lib/types/players";

/** Format a goal-projection number for the split (one decimal, em-dash for missing). */
function fmtGoals(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return v.toFixed(1);
}

/** Plain-language gloss for the finishing factor (open-play goals-vs-xG conversion skill).
 *  > 1.0 means the player historically out-finishes their xG; ~1.0 is neutral; < 1.0 under-finishes. */
function finishingGloss(factor: number): string {
  if (factor >= 1.08) return "historically out-finishes their xG (clinical)";
  if (factor <= 0.92) return "historically under-finishes their xG";
  return "finishes roughly in line with their xG (neutral)";
}

/** The honest goal-projection breakdown for FW/MF profiles: headline expected goals with its band,
 *  split into open-play and penalty contributions, plus npxG and the finishing factor with a gloss.
 *  Degrades gracefully: penalty/npxg/finishing lines are each omitted when their value is null, and
 *  no "null"/"NaN" ever reaches the DOM. Renders only when profile.goals is non-null (caller-gated). */
function GoalProjectionSplit({
  goals,
  finishingFactor,
}: {
  goals: NonNullable<PlayerProfile["goals"]>;
  finishingFactor: number | null;
}) {
  const hasBand = goals.bandLow != null && goals.bandHigh != null;
  const hasOpenPlay = goals.openPlay != null;
  const hasPenalty = goals.penalty != null;
  const hasNpxg = goals.npxg != null;
  // open-play / penalty proportions of the headline expected, for the stacked bar (graceful if absent).
  const total = Math.max((goals.openPlay ?? 0) + (goals.penalty ?? 0), 0.0001);
  const openPct = ((goals.openPlay ?? 0) / total) * 100;
  const penPct = ((goals.penalty ?? 0) / total) * 100;

  return (
    <Card>
      <CardHeader title="Goal projection" hint="open play + penalty" />

      {/* headline expected goals with its uncertainty band */}
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-secondary">Expected goals</span>
        <span className="tnum text-right">
          <span className="font-display text-2xl font-bold text-gold-strong">{fmtGoals(goals.expected)}</span>
          {hasBand ? (
            <span className="ml-1.5 text-xs text-muted">
              ({fmtGoals(goals.bandLow)}&ndash;{fmtGoals(goals.bandHigh)})
            </span>
          ) : null}
        </span>
      </div>

      {/* open-play / penalty stacked split bar */}
      {hasOpenPlay || hasPenalty ? (
        <span
          className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-elevated"
          role="img"
          aria-label={`Open play ${fmtGoals(goals.openPlay)} goals, penalty ${fmtGoals(goals.penalty)} goals`}
        >
          {hasOpenPlay ? (
            <span className="block h-full bg-gold" style={{ width: `${openPct}%` }} />
          ) : null}
          {hasPenalty ? (
            <span className="block h-full bg-confident" style={{ width: `${penPct}%` }} />
          ) : null}
        </span>
      ) : null}

      {/* contribution rows */}
      <div className="mt-3 grid grid-cols-1 gap-1.5 text-sm sm:grid-cols-2">
        {hasOpenPlay ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 text-secondary">
              <span className="inline-block h-2 w-2 rounded-full bg-gold" aria-hidden /> Open play
            </span>
            <span className="tnum font-semibold text-fg">{fmtGoals(goals.openPlay)}</span>
          </div>
        ) : null}
        {hasPenalty ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-1.5 text-secondary">
              <span className="inline-block h-2 w-2 rounded-full bg-confident" aria-hidden /> Penalty
            </span>
            <span className="tnum font-semibold text-fg">{fmtGoals(goals.penalty)}</span>
          </div>
        ) : null}
        {hasNpxg ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary">Non-penalty xG</span>
            <span className="tnum font-medium text-secondary">{fmtGoals(goals.npxg)}</span>
          </div>
        ) : null}
        {finishingFactor != null ? (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-secondary">Finishing factor</span>
            <span className="tnum font-medium text-secondary">{finishingFactor.toFixed(2)}&times;</span>
          </div>
        ) : null}
      </div>

      {/* short finishing read: the gloss word only; the full how-it-is-built lives in methodology. */}
      {finishingFactor != null ? (
        <p className="mt-3 text-xs leading-relaxed text-muted">
          Finishing: {finishingGloss(finishingFactor)}.{" "}
          <Link href="/methodology#player-projections" className="text-confident hover:underline">
            How the goal split works
          </Link>
        </p>
      ) : null}
    </Card>
  );
}

/** One expected-vs-actual row in the role block: metric label, projected value, accrued actual, and
 *  a paired bar (actual fill over the expected reference). */
function MetricRow({
  metric,
  expected,
  actual,
}: {
  metric: string;
  expected: number | null;
  actual: number | null;
}) {
  const exp = expected ?? 0;
  const act = actual ?? 0;
  const scale = Math.max(exp, act, 0.0001);
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between text-sm">
        <span className="text-secondary">{metricLabel(metric)}</span>
        <span className="tnum text-fg">
          <span className="font-semibold">{fmtMetric(actual)}</span>
          <span className="text-muted"> / {fmtMetric(expected)} exp</span>
        </span>
      </div>
      <div className="mt-1.5 grid gap-1">
        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-elevated" title="Expected" aria-hidden>
          <span className="block h-full rounded-full bg-gold/50" style={{ width: `${(exp / scale) * 100}%` }} />
        </span>
        <span className="block h-1.5 w-full overflow-hidden rounded-full bg-elevated" title="Actual" aria-hidden>
          <span className="block h-full rounded-full bg-confident" style={{ width: `${(act / scale) * 100}%` }} />
        </span>
      </div>
    </div>
  );
}

/** A positional-percentile bar (0..100) for a baseline metric. */
function PercentileBar({ label, value }: { label: string; value: number }) {
  const v = Math.max(0, Math.min(100, value));
  const strong = v >= 75;
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-secondary">{label}</span>
        <span className={cn("tnum font-medium", strong ? "text-gold-strong" : "text-muted")}>
          {Math.round(v)}th
        </span>
      </div>
      <span className="mt-1 block h-1.5 w-full overflow-hidden rounded-full bg-elevated" aria-hidden>
        <span
          className={cn("block h-full rounded-full", strong ? "bg-gold" : "bg-confident")}
          style={{ width: `${v}%` }}
        />
      </span>
    </div>
  );
}

/** Prettify a percentile key ("key_passes" -> "Key passes", "xg" -> "xG"). */
function pctLabel(key: string): string {
  if (key === "xg") return "xG";
  if (key === "xa") return "xA";
  const s = key.replace(/_/g, " ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function PlayerProfileView({
  profile,
  runId,
  meta,
}: {
  profile: PlayerProfile;
  /** Current run id for the provenance footer, if resolvable. */
  runId: string | null;
  /** Freshness contract for the honest as-of stamp; null degrades to a neutral label. */
  meta?: ProjectionMeta | null;
}) {
  const { player, projections, matchStats, percentileContext, goals, finishingFactor } = profile;
  const projByMetric = new Map<string, PlayerProjection>(projections.map((p) => [p.metric, p]));

  // role-driven metric set, intersected with the metrics actually present.
  const roleMetrics = presentRoleMetrics(player.role, projections);
  const headlineMetric = roleMetrics[0] ?? null;

  // actuals-only when there is no projection at all for this player.
  const actualsOnly = !player.hasBaseline || projections.every((p) => p.expectedValue == null);

  // trajectory for the headline metric (cumulative actual accrual across the played log).
  const trajPoints: TrajectoryPoint[] = (() => {
    if (!headlineMetric) return [];
    const pts: TrajectoryPoint[] = [];
    let cum = 0;
    for (const s of matchStats) {
      const single = accruedActual(headlineMetric, [s]) ?? 0;
      cum += single;
      pts.push({ matchId: s.matchId, actual: cum });
    }
    return pts;
  })();
  const headlineExpectedTotal = headlineMetric
    ? projByMetric.get(headlineMetric)?.expectedValue ?? null
    : null;

  // any live source recorded in the log → "live actuals" provenance note.
  const liveSource = matchStats.find((s) => s.source)?.source ?? null;

  const teamLink = player.team ? `/teams/${teamSlug(player.team)}` : null;

  return (
    <section className="mx-auto max-w-4xl">
      {/* breadcrumb */}
      <Link href="/players" className="text-xs font-medium text-muted hover:text-fg hover:underline">
        ← All players
      </Link>

      {/* identity */}
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="flex items-center gap-3 font-display text-3xl font-bold text-fg">
          <Flag team={player.nation} size="text-3xl" />
          {player.name}
        </h1>
        {player.role ? <Tag variant={roleTagVariant(player.role)}>{roleLabel(player.role)}</Tag> : null}
        {actualsOnly ? <Tag variant="upset">Actuals only</Tag> : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-secondary">
        {teamLink ? (
          <span>
            <Link href={teamLink} className="font-medium text-fg hover:underline">{player.team}</Link>
          </span>
        ) : player.team ? <span>{player.team}</span> : null}
        {subRoleLabel(player.subRole) ? <span>{subRoleLabel(player.subRole)}</span> : null}
        {player.club ? <span className="text-muted">{player.club}</span> : null}
      </div>

      {/* honest as-of stamp (degrades to a neutral label when meta is null/unknown) */}
      {!actualsOnly ? <ProjectionStamp meta={meta ?? null} className="mt-3" /> : null}

      {/* role-specific EXPECTED vs ACTUAL + trajectory */}
      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title={`${roleLabel(player.role)} output`}
            hint={actualsOnly ? "actuals only" : "actual / expected"}
          />
          {roleMetrics.length === 0 ? (
            <p className="text-sm text-muted">
              {actualsOnly
                ? "This player is tracked without a statistical baseline, so no projection is available. The per-match log below shows recorded actuals only."
                : "No role projection available for this player."}
            </p>
          ) : (
            <div className="divide-y divide-border">
              {roleMetrics.map((m) => (
                <MetricRow
                  key={m}
                  metric={m}
                  expected={projByMetric.get(m)?.expectedValue ?? null}
                  actual={accruedActual(m, matchStats)}
                />
              ))}
            </div>
          )}
        </Card>

        <Card>
          {headlineMetric ? (
            <TrajectoryChart
              metric={headlineMetric}
              expectedTotal={headlineExpectedTotal}
              points={trajPoints}
              matchesPlayed={Math.max(matchStats.length, trajPoints.length)}
            />
          ) : (
            <>
              <CardHeader title="Trajectory" />
              <p className="text-sm text-muted">No projected metric to chart for this player.</p>
            </>
          )}
        </Card>
      </div>

      {/* npxG / finishing goal split - FW/MF with a projected goal breakdown only */}
      {goals ? (
        <div className="mt-4">
          <GoalProjectionSplit goals={goals} finishingFactor={finishingFactor} />
        </div>
      ) : null}

      {/* positional-percentile context - baseline players only */}
      {!actualsOnly && percentileContext && Object.keys(percentileContext).length > 0 ? (
        <div className="mt-4">
          <Card>
            <CardHeader title="Positional percentiles" hint={`vs other ${roleLabel(player.role).toLowerCase()}s`} />
            <p className="mb-2 text-xs text-secondary">
              Where {player.name.split(" ")[0]} ranks among players of the same role on the baseline
              metrics (higher is better).
            </p>
            <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {Object.entries(percentileContext)
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => (
                  <PercentileBar key={k} label={pctLabel(k)} value={v} />
                ))}
            </div>
          </Card>
        </div>
      ) : null}

      {/* per-match log */}
      <div className="mt-4">
        <Card>
          <CardHeader title="Match log" hint={`${matchStats.length} played`} />
          {matchStats.length === 0 ? (
            <p className="text-sm text-muted">No matches played yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-border text-[10px] font-medium tracking-wide text-muted uppercase">
                    <th className="py-1 pr-2 text-left font-medium">Match</th>
                    <th className="px-2 py-1 text-right font-medium">Min</th>
                    {player.role === "GK" ? (
                      <>
                        <th className="px-2 py-1 text-right font-medium">Saves</th>
                        <th className="px-2 py-1 text-right font-medium">Conceded</th>
                        <th className="px-2 py-1 text-center font-medium">CS</th>
                      </>
                    ) : (
                      <>
                        <th className="px-2 py-1 text-right font-medium">G</th>
                        <th className="px-2 py-1 text-right font-medium">A</th>
                        <th className="hidden px-2 py-1 text-right font-medium sm:table-cell">Sh</th>
                        <th className="hidden px-2 py-1 text-right font-medium sm:table-cell">KP</th>
                      </>
                    )}
                    <th className="px-2 py-1 pl-2 text-right font-medium">Source</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {matchStats.map((s) => (
                    <tr key={s.matchId} className="hover:bg-elevated/60">
                      <td className="py-1.5 pr-2 text-sm font-medium text-fg">{matchLabel(s.matchId)}</td>
                      <td className="tnum px-2 py-1.5 text-right text-sm text-secondary">{s.minutes ?? "—"}</td>
                      {player.role === "GK" ? (
                        <>
                          <td className="tnum px-2 py-1.5 text-right text-sm text-fg">{s.saves ?? "—"}</td>
                          <td className="tnum px-2 py-1.5 text-right text-sm text-secondary">{s.goalsConceded ?? "—"}</td>
                          <td className="px-2 py-1.5 text-center text-sm">
                            {s.cleanSheet ? <Tag variant="up" className="px-1.5 py-0 text-[10px]">CS</Tag> : <span className="text-muted">—</span>}
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="tnum px-2 py-1.5 text-right text-sm text-fg">{s.goals ?? "—"}</td>
                          <td className="tnum px-2 py-1.5 text-right text-sm text-fg">{s.assists ?? "—"}</td>
                          <td className="tnum hidden px-2 py-1.5 text-right text-sm text-secondary sm:table-cell">{s.shots ?? "—"}</td>
                          <td className="tnum hidden px-2 py-1.5 text-right text-sm text-secondary sm:table-cell">{s.keyPasses ?? "—"}</td>
                        </>
                      )}
                      <td className="px-2 py-1.5 pl-2 text-right text-[11px] text-muted">{sourceLabel(s.source)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {/* honest projection note + provenance footer */}
      <div className="mt-4 rounded-card border border-border bg-bg-subtle p-4">
        <p className="max-w-prose text-xs leading-relaxed text-secondary">
          {actualsOnly ? (
            <>Tracked for live output, no pre-tournament baseline: actuals only.</>
          ) : (
            <>Probabilistic projections.</>
          )}{" "}
          <Link href="/methodology#player-projections" className="text-confident hover:underline">
            How projections are built
          </Link>
        </p>
        <p className="tnum mt-2 text-[11px] text-muted">
          {!actualsOnly ? "Baselines powered by StatsBomb · " : ""}
          {liveSource ? `Live actuals: ${sourceLabel(liveSource)} · ` : ""}
          {runId ? `Run ${runId} · ` : ""}
          Independent project, not affiliated with FIFA.
        </p>
      </div>
    </section>
  );
}
