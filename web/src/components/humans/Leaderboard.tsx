import { Card, CardHeader } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { TeamName, OverlapPill, benchShort } from "@/components/humans/parts";
import { tieAwareRanks } from "@/lib/data/humans";
import { cn } from "@/lib/utils";
import type { HumanEntry, ScoringMode } from "@/lib/types/humans";

/** One DENSE leaderboard row. The always-visible <summary> carries only rank, name, the champion-pick
 *  flag (+ model/benchmark marker) and the TOTAL actuals-only points; the full per-round breakdown
 *  (Groups / R16 / QF / SF / Final + champion overlap) lives in the <details> body, collapsed by
 *  default. Native <details>/<summary> keeps SSR deterministic (no client state). `rank` is the
 *  TIE-AWARE displayed rank (entries on the same points share it); `joint` is true when this entry
 *  shares its rank with another, so the row labels the tie explicitly (e.g. "=1") and the pin stays
 *  honest (the model never renders as a solo rank above humans on the same score). */
function EntryRow({ entry, rank, joint }: { entry: HumanEntry; rank: number; joint: boolean }) {
  const s = entry.score;
  const v1 = entry.schemaVersion < 2;
  const isModel = !!entry.isModel;
  return (
    <li>
      <details
        className={cn(
          "group rounded-card border bg-surface",
          isModel ? "border-confident/40 bg-confident/5" : "border-border",
        )}
      >
        <summary className="flex cursor-pointer list-none items-center gap-2 p-3 [&::-webkit-details-marker]:hidden">
          <span
            className="tnum w-6 shrink-0 text-center font-display text-sm font-bold text-muted"
            title={joint ? `Joint ${rank}` : undefined}
          >
            <span aria-hidden>{joint ? "=" : ""}{rank}</span>
            <span className="sr-only">{joint ? `joint rank ${rank}` : `rank ${rank}`}</span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-fg">{entry.displayName}</span>
              {isModel ? <Tag variant="confident" className="shrink-0">model · pre-tournament</Tag> : null}
              {v1 ? <span className="shrink-0 text-[10px] text-muted">groups + champion</span> : null}
            </div>
            <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs">
              <span className="shrink-0 text-muted">picks</span>
              <TeamName team={entry.champion} strong className="min-w-0" />
              {/* The agrees-with-the-model pill is self-referential on the model's own row, so omit it there. */}
              {!isModel ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                    entry.agreesWithModelChampion ? "bg-up-bg text-up" : "bg-upset-bg text-upset",
                  )}
                >
                  {entry.agreesWithModelChampion ? `= ${benchShort()}` : `≠ ${benchShort()}`}
                </span>
              ) : null}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="tnum font-display text-lg font-bold leading-none text-fg">{s.points}</div>
            <div className="tnum text-[10px] text-muted">/ {s.maxPoints} pts</div>
          </div>
          <span
            aria-hidden
            className="shrink-0 text-xs text-muted transition-transform group-open:rotate-180"
          >
            ▾
          </span>
        </summary>

        <div className="flex flex-wrap gap-1.5 border-t border-border px-3 pt-2 pb-3 pl-11">
          <OverlapPill label="Groups" hit={s.groupWinners.hit} total={s.groupWinners.total} />
          {!v1 ? (
            <>
              <OverlapPill label="R16" hit={s.reachR16.hit} total={s.reachR16.total} />
              <OverlapPill label="QF" hit={s.reachQF.hit} total={s.reachQF.total} />
              <OverlapPill label="SF" hit={s.reachSF.hit} total={s.reachSF.total} />
              <OverlapPill label="Final" hit={s.finalists.hit} total={s.finalists.total} />
            </>
          ) : null}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
              s.championHit ? "bg-up-bg text-up" : "bg-elevated text-secondary",
            )}
          >
            Champion {s.championHit ? "✓" : "✗"}
          </span>
        </div>
      </details>
    </li>
  );
}

/** The humans leaderboard: every entry (incl. the model, as one competitor) scored actuals-only,
 *  points desc. Each row is compact; tap a row to expand its per-round breakdown. */
export function Leaderboard({
  entries, title = "Leaderboard",
}: { entries: HumanEntry[]; mode?: ScoringMode; title?: string }) {
  // TIE-AWARE display rank: entries on the SAME points share a joint rank (1,1,1,4,...). The model is
  // already pinned FIRST within its points tie by byScore, so it renders at the top of its joint tier
  // (keeping its highlight) without ever outranking a strictly higher score.
  const ranks = tieAwareRanks(entries);
  const rankCounts = ranks.reduce<Record<number, number>>((m, r) => ((m[r] = (m[r] ?? 0) + 1), m), {});
  return (
    <Card>
      <CardHeader title={title} hint={`${entries.length} ${entries.length === 1 ? "entry" : "entries"}`} />
      <ol className="space-y-2">
        {entries.map((e, i) => (
          <EntryRow key={e.id} entry={e} rank={ranks[i]} joint={rankCounts[ranks[i]] > 1} />
        ))}
      </ol>
      <p className="mt-3 text-xs text-muted">
        Every bracket is scored ONLY against actual results. The model competes as one entrant with the
        bracket it locked BEFORE kickoff (its pre-tournament pick), exactly like every human, so the
        live re-projection never changes its score. Tap a row for its per-round breakdown: the pills
        show how many of each round&apos;s decided teams the entry also picked. Rounds not yet decided
        show as <span className="italic">pending</span> and lock in as results arrive. Brackets that
        recorded only group winners + champion are scored on just those dimensions.
      </p>
    </Card>
  );
}
