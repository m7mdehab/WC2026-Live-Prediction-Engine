import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { cn, simPct } from "@/lib/utils";
import type { TeamGroupFinish, GroupMate } from "@/lib/types/teams";

const ORDINAL = ["", "1st", "2nd", "3rd", "4th"];

function rankStyle(rank: number): string {
  if (rank === 1) return "bg-gold/15 text-gold-strong";
  if (rank === 2) return "bg-confident/15 text-confident";
  if (rank === 3) return "bg-upset-bg text-upset";
  return "bg-elevated text-muted";
}

/** The team's projected group finish (single most-likely placing + qualification odds) over the
 *  compact 4-team ordering, with a link through to the full table on /groups. Mirrors the group
 *  page's rank colours so the two pages read as one. */
export function TeamGroupCard({
  finish,
  mates,
}: {
  finish: TeamGroupFinish | null;
  mates: GroupMate[];
}) {
  if (!finish) {
    return (
      <Card>
        <CardHeader title="Group" />
        <p className="text-sm text-muted">No projected standings published yet.</p>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title={`Group ${finish.groupCode}`} hint="projected finish" />

      <div className="flex items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className={cn("tnum grid h-9 w-9 place-items-center rounded-md text-sm font-bold", rankStyle(finish.projRank))}>
            {finish.projRank}
          </span>
          <div className="leading-tight">
            <div className="font-display text-lg font-bold text-fg">{ORDINAL[finish.projRank]} place</div>
            <div className="text-xs text-secondary">single most-likely finish</div>
          </div>
        </div>
        <div className="text-right leading-tight">
          <div className="tnum font-display text-2xl font-bold text-confident">{simPct(finish.pQualify, 0)}</div>
          <div className="text-xs text-secondary">qualify</div>
        </div>
      </div>

      <ol className="mt-4 divide-y divide-border border-t border-border">
        {mates.map((m) => (
          <li
            key={m.team}
            className={cn(
              "grid grid-cols-[1.5rem_1.5rem_minmax(0,1fr)_auto] items-center gap-2 py-1.5",
              m.isSelf && "rounded-sm bg-elevated/60",
            )}
          >
            <span className={cn("tnum grid h-5 w-5 place-items-center rounded text-[11px] font-bold", rankStyle(m.projRank))}>
              {m.projRank}
            </span>
            <Flag team={m.team} size="text-base" />
            <span className={cn("min-w-0 truncate text-sm", m.isSelf ? "font-semibold text-fg" : "text-secondary")}>
              {m.team}
            </span>
            <span className="tnum text-right text-xs text-secondary">{simPct(m.pQualify, 0)}</span>
          </li>
        ))}
      </ol>

      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-muted">
          <Tag variant="neutral">Win group {simPct(finish.pWinGroup, 0)}</Tag>
        </span>
        <Link href="/groups" className="text-xs font-medium text-confident hover:underline">
          Full Group {finish.groupCode} table ↗
        </Link>
      </div>
    </Card>
  );
}
