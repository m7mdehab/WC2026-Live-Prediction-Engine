import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { simPct } from "@/lib/utils";
import { deltaAmongShown, type RetrospectiveRow } from "@/lib/data/retrospective";

// Medal accents keyed to the ACTUAL podium finish (1/2/3), never the cond0 row rank - so a medal can
// never adorn a team that did not finish in the top three (unlike the old rank-index accents).
const MEDAL: Record<1 | 2 | 3, { border: string; bg: string }> = {
  1: { border: "var(--gold)", bg: "color-mix(in srgb, var(--gold) 9%, transparent)" },
  2: { border: "var(--medal-silver-accent)", bg: "color-mix(in srgb, var(--medal-silver-accent) 11%, transparent)" },
  3: { border: "var(--medal-bronze-accent)", bg: "color-mix(in srgb, var(--medal-bronze-accent) 11%, transparent)" },
};

// Delta direction -> token classes (no raw hex). Green when the team finished BETTER than its model rank
// implied, red when worse, muted when it matched.
const DIR: Record<"better" | "worse" | "match", string> = {
  better: "bg-up-bg text-up",
  worse: "bg-down-bg text-down",
  match: "bg-elevated text-muted",
};

/** The compact delta chip: an arrow + magnitude, coloured by direction, ALWAYS labelled as being among
 *  the eight shown (never a global placement). */
function DeltaChip({ delta, dir }: { delta: number; dir: "better" | "worse" | "match" }) {
  const mag = Math.abs(delta);
  const glyph = dir === "better" ? "▲" : dir === "worse" ? "▼" : "=";
  const title =
    dir === "match"
      ? "Finished where the model ranked it, among these eight"
      : `${mag} place${mag === 1 ? "" : "s"} ${dir} than the model's rank, among these eight`;
  return (
    <span
      title={title}
      className={`tnum inline-flex w-9 shrink-0 items-center justify-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-bold ${DIR[dir]}`}
    >
      <span aria-hidden>{glyph}</span>
      {dir === "match" ? null : <span>{mag}</span>}
      <span className="sr-only">{title}</span>
    </span>
  );
}

/**
 * The settled-tournament retrospective that REPLACES the live Title race card: an explicit
 * predicted-vs-actual comparison. Rows are the model's PRE-TOURNAMENT top 8, ordered by cond0 champion
 * probability (descending, well-separated, never alphabetical). Each row pairs the model's pre-tournament
 * rank + odds against where the team ACTUALLY finished, with a delta chip coloured green/red for a
 * better/worse finish than the model's rank implied. The delta is a competition rank AMONG THESE EIGHT
 * teams only - positions five and below are indeterminate without placement regulations, so no global
 * 1..48 placement is ever asserted.
 */
export function ModelRetrospectiveCard({ rows }: { rows: RetrospectiveRow[] }) {
  const deltas = deltaAmongShown(rows);
  return (
    <Card>
      <CardHeader title="How the model saw it" hint="predicted vs actual" />
      {rows.length === 0 ? (
        <p className="text-sm text-secondary">The pre-tournament read is unavailable.</p>
      ) : (
        <>
          {/* column headers: the semantics are explicit (model rank | team | actual finish | delta | odds) */}
          <div className="mb-1 flex items-center gap-2 border-b border-border px-2 pb-1 text-[9px] font-semibold tracking-wide text-muted uppercase">
            <span className="w-4 shrink-0 text-right" title="The model's pre-tournament rank">#</span>
            <span className="w-4 shrink-0" aria-hidden />
            <span className="w-20 shrink-0 sm:w-24">Team</span>
            <span className="flex-1">Actual finish</span>
            <span className="w-9 shrink-0 text-center" title="Places better or worse than the model's rank, among these eight">vs</span>
            <span className="w-12 shrink-0 text-right" title="Pre-tournament champion odds">Pre-cup</span>
          </div>
          <ol className="space-y-1.5">
            {rows.map((r, i) => {
              const medal = r.podium ? MEDAL[r.podium] : null;
              const d = deltas[i];
              return (
                <li
                  key={r.team}
                  className="flex items-center gap-2 rounded-md py-1 pr-2 pl-2"
                  style={
                    medal
                      ? { borderLeft: `2px solid ${medal.border}`, background: medal.bg }
                      : { borderLeft: "2px solid transparent" }
                  }
                >
                  <span className="tnum w-4 shrink-0 text-right text-xs text-muted">{d.modelRank}</span>
                  <Flag team={r.team} size="text-xl" />
                  <span className="w-20 shrink-0 truncate text-sm font-medium text-fg sm:w-24">{r.team}</span>
                  <span className="flex-1 truncate text-xs text-secondary">{r.finish}</span>
                  <DeltaChip delta={d.delta} dir={d.dir} />
                  <span className="tnum w-12 shrink-0 text-right text-sm font-semibold text-fg">
                    {simPct(r.cond0)}
                  </span>
                </li>
              );
            })}
          </ol>
        </>
      )}
      <p className="mt-3 text-xs text-muted">
        The model&apos;s pre-tournament champion odds (before a ball was kicked) against where each side
        actually finished. Ordered by that pre-tournament number; the green/red chip is how many places
        better or worse a side finished than the model ranked it, among these eight.
      </p>
    </Card>
  );
}
