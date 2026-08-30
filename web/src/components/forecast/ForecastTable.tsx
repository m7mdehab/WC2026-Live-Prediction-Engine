import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { cn, simPct } from "@/lib/utils";
import { teamSlug } from "@/lib/teamSlug";
import type { ForecastTeam } from "@/lib/types/forecast";
import type { StageKey, StageResolution } from "@/lib/data/resolvedStages";

/** Per (team, stage) resolved-stage verdicts (achieved / failed / in_progress + "was NN%"), keyed by
 *  team name. Optional: absent -> every cell renders its live probability exactly as before. */
export type ResolutionMap = Record<string, Record<StageKey, StageResolution>>;

// Faint gold / silver / bronze accent for the top 3 - the same treatment as the home title race.
const MEDAL: string[] = ["text-gold-strong", "text-fg", "text-fg"];

/** The resolved-stage verdict mark: a check (achieved) or cross (failed) plus the "was NN%" - the
 *  model's odds from the last retained run while the stage was still uncertain. null for an unresolved
 *  (in-progress) stage, which keeps its live probability. Tone via the up/down tokens. */
function StageMark({ res }: { res: StageResolution | undefined }) {
  if (!res || res.verdict === "in_progress") return null;
  const ok = res.verdict === "achieved";
  return (
    <span
      className={cn("inline-flex items-center gap-0.5 font-medium", ok ? "text-up" : "text-down")}
      title={`${ok ? "achieved" : "failed"} (model odds while still uncertain: ${simPct(res.wasProb, 0)})`}
    >
      <span aria-hidden>{ok ? "✓" : "✗"}</span>
      <span>{simPct(res.wasProb, 0)}</span>
    </span>
  );
}

/** A right-aligned tabular probability cell. When the stage is RESOLVED it shows the verdict mark +
 *  "was NN%" instead of the (now degenerate 100%/0%) live probability; otherwise the live prob, with
 *  `dim` greying near-zero odds so the eye tracks live ones. */
function P({ value, res, className }: { value: number | null; res?: StageResolution; className?: string }) {
  if (res && res.verdict !== "in_progress") {
    return (
      <td className={cn("tnum px-2 py-1.5 text-right text-sm", className)}>
        <StageMark res={res} />
      </td>
    );
  }
  const dim = (value ?? 0) < 0.005;
  return (
    <td className={cn("tnum px-2 py-1.5 text-right text-sm", dim ? "text-muted" : "text-fg", className)}>
      {simPct(value)}
    </td>
  );
}

/** One ranking row: rank, flag + name (deep link), then the stage-path odds in TOURNAMENT-FLOW order
 *  (group code, group qualification, quarter, semi, final, champion) so the row reads left-to-right the
 *  way the tournament advances, ending on the headline title-odds bar. When a stage is RESOLVED by
 *  results the cell shows a check/cross + "was NN%" instead of the live prob. */
function Row({ t, rank, max, res }: { t: ForecastTeam; rank: number; max: number; res?: Record<StageKey, StageResolution> }) {
  const champ = t.champion ?? 0;
  const barFrac = max > 0 ? champ / max : 0;
  const champRes = res?.champion;
  const groupRes = res?.advance_group;
  const champResolved = champRes && champRes.verdict !== "in_progress";
  const groupResolved = groupRes && groupRes.verdict !== "in_progress";
  return (
    <tr className="hover:bg-elevated/60">
      <td className="tnum w-7 py-1.5 text-right text-xs text-muted">{rank}</td>
      <td className="py-1.5 pl-2">
        {/* team profile deep link (pure slug helper - no server data layer import) */}
        <Link
          href={`/teams/${teamSlug(t.team)}`}
          className="flex min-w-0 items-center gap-2 hover:underline"
        >
          <Flag team={t.team} size="text-base" link={false} />
          <span className="truncate text-sm font-medium text-fg">{t.team}</span>
        </Link>
      </td>
      <td className="hidden px-2 py-1.5 text-center text-xs text-muted sm:table-cell">
        {t.groupCode ?? "—"}
      </td>
      <td className="px-2 py-1.5">
        {/* group qualification: an inline advance-from-group bar, or the resolved verdict + "was NN%". */}
        <span className="flex items-center justify-end gap-2">
          {groupResolved ? (
            <span className="shrink-0 text-right text-sm">
              <StageMark res={groupRes} />
            </span>
          ) : (
            <>
              <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-elevated sm:block">
                <span className="block h-full rounded-full bg-confident"
                      style={{ width: `${(t.advanceGroup ?? 0) * 100}%` }} />
              </span>
              <span className="tnum w-11 shrink-0 text-right text-sm text-fg">{simPct(t.advanceGroup, 0)}</span>
            </>
          )}
        </span>
      </td>
      <P value={t.reachQf} res={res?.reach_qf} className="hidden sm:table-cell" />
      <P value={t.reachSf} res={res?.reach_sf} className="hidden md:table-cell" />
      <P value={t.reachFinal} res={res?.reach_final} className="hidden sm:table-cell" />
      <td className="px-2 py-1.5">
        {/* inline champion-probability bar, scaled to the leader (the chart's strength); a resolved
            champion shows the verdict + "was NN%" beside the bar instead of the degenerate 100%/0%. */}
        <span className="flex items-center justify-end gap-2">
          <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-elevated sm:block">
            <span
              className={cn("block h-full rounded-full", rank === 1 ? "bg-gold" : "bg-confident")}
              style={{ width: `${barFrac * 100}%` }}
            />
          </span>
          {champResolved ? (
            <span className="shrink-0 text-right text-sm">
              <StageMark res={champRes} />
            </span>
          ) : (
            <span className={cn("tnum w-11 shrink-0 text-right text-sm font-semibold", MEDAL[rank - 1] ?? "text-fg")}>
              {simPct(t.champion)}
            </span>
          )}
        </span>
      </td>
    </tr>
  );
}

/** The merged champion-probability card: ONE surface that leads with the top 10 teams by title odds,
 *  each row carrying an inline probability bar (scaled to the leader) PLUS the full stage-path detail
 *  in tournament-flow order (group qualification / quarter / semi / final / champion). The remaining
 *  teams sit behind a
 *  native, server-rendered <details> ("Show all 48 teams"), collapsed by default. Stage columns reveal
 *  progressively at wider breakpoints so the row never overflows on phones. */
export function ForecastTable({ teams, resolution }: { teams: ForecastTeam[]; resolution?: ResolutionMap }) {
  const max = teams[0]?.champion ?? 0;
  const TOP = 10;
  const top = teams.slice(0, TOP);
  const rest = teams.slice(TOP);
  // whether ANY stage has resolved (so the footnote only appears once results exist).
  const anyResolved =
    !!resolution &&
    Object.values(resolution).some((s) => Object.values(s).some((r) => r.verdict !== "in_progress"));

  const head = (
    <thead>
      <tr className="border-b border-border text-[10px] font-medium tracking-wide text-muted uppercase">
        <th className="w-7 py-1 text-right font-medium">#</th>
        <th className="py-1 pl-2 text-left font-medium">Team</th>
        <th className="hidden px-2 py-1 text-center font-medium sm:table-cell">Grp</th>
        <th className="px-2 py-1 text-right font-medium">Qualify</th>
        <th className="hidden px-2 py-1 text-right font-medium sm:table-cell">Quarter</th>
        <th className="hidden px-2 py-1 text-right font-medium md:table-cell">Semi</th>
        <th className="hidden px-2 py-1 text-right font-medium sm:table-cell">Final</th>
        <th className="px-2 py-1 text-right font-medium">Champ</th>
      </tr>
    </thead>
  );

  return (
    <Card>
      <CardHeader title="Champion probability" hint={`top ${top.length} of ${teams.length}`} />
      {teams.length === 0 ? (
        <p className="text-sm text-secondary">No forecast published yet.</p>
      ) : (
        <>
          <table className="w-full border-collapse">
            {head}
            <tbody className="divide-y divide-border">
              {top.map((t, i) => (
                <Row key={t.team} t={t} rank={i + 1} max={max} res={resolution?.[t.team]} />
              ))}
            </tbody>
          </table>

          {rest.length > 0 ? (
            <details className="mt-3 group">
              <summary className="cursor-pointer list-none text-xs font-medium text-confident hover:underline">
                Show all {teams.length} teams
              </summary>
              <table className="mt-2 w-full border-collapse">
                {head}
                <tbody className="divide-y divide-border">
                  {rest.map((t, i) => (
                    <Row key={t.team} t={t} rank={TOP + i + 1} max={max} res={resolution?.[t.team]} />
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </>
      )}
      {anyResolved ? (
        <p className="mt-3 text-xs text-muted">
          <span className="text-up">✓</span> reached / <span className="text-down">✗</span> missed marks a
          stage the results have settled; the % beside it is the model&apos;s odds from the last run while
          that stage was still uncertain (&ldquo;was NN%&rdquo;). Unsettled stages show the live odds.
        </p>
      ) : null}
      <p className="mt-3 text-xs text-muted">
        Bars are scaled to the leader; the % is the model&apos;s absolute title odds. Columns read
        left-to-right the way the tournament flows: Group qualification, Quarter-final, Semi-final,
        Finalist, Champion, revealing as the screen widens.{" "}
        <Link href="/methodology#forecast-reads" className="text-confident hover:underline">
          What these mean
        </Link>
      </p>
    </Card>
  );
}
