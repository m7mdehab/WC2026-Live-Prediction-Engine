// Small shared presentational atoms for the AI-vs-Humans page. Server components (no interactivity).
import { Flag } from "@/components/ui/Flag";
import { teamCode } from "@/lib/teamCodes";
import { cn } from "@/lib/utils";

/** Short label for the champion-pick comparison pill. The model is a COMPETITOR, not the yardstick:
 *  the pill says whether an entry picked the SAME champion as the model. Mode-independent (always
 *  model-relative), so it takes no argument. */
export const benchShort = (): string => "model";

/** A team with its flag. On mobile the FIFA trigram replaces the full name (locked-UX mobile rule). */
export function TeamName({ team, className, strong }: { team: string; className?: string; strong?: boolean }) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5", className)}>
      <Flag team={team} size="text-sm" link={false} />
      <span className={cn("truncate", strong ? "font-semibold text-fg" : "text-secondary")}>
        <span className="sm:hidden">{teamCode(team)}</span>
        <span className="hidden sm:inline">{team}</span>
      </span>
    </span>
  );
}

/** A compact "hit / total" overlap pill, e.g. "QF 6/8". Tints by how full the overlap is. An
 *  UNDECIDED round (total === 0, PENDING) renders "pending" rather than the meaningless "0/0" - it
 *  scores nothing yet and locks in as actual results arrive. */
export function OverlapPill({ label, hit, total }: { label: string; hit: number; total: number }) {
  const pending = total === 0;
  const frac = total ? hit / total : 0;
  const tone =
    pending ? "bg-elevated text-muted"
      : frac >= 0.75 ? "bg-up-bg text-up"
        : frac >= 0.4 ? "bg-confident/10 text-confident"
          : "bg-elevated text-secondary";
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", tone)}>
      <span className="opacity-70">{label}</span>
      {pending
        ? <span className="font-semibold italic">pending</span>
        : <span className="tnum font-semibold">{hit}/{total}</span>}
    </span>
  );
}
