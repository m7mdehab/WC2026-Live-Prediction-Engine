import { Flag } from "@/components/ui/Flag";
import { teamCode } from "@/lib/teamCodes";
import { cn, simPct } from "@/lib/utils";

// Ported (re-created) from feature/page-dashboards components/strip/MoverTile.tsx - the one small
// helper the TitleRaceClient island needs. Only this tile was ported; the rest of the strip/ index
// stays behind on the source branch.

/** Strip tile for one odds mover: flag + trigram, the current probability, and a signed delta
 *  chip in the shared up/down accents (bg-up-bg text-up / bg-down-bg text-down, the same pairing
 *  the Leaderboard chips use). Fail-soft: no team or non-finite numbers render nothing.
 *
 *  The tile is not itself a link, so its flag keeps the default deep link to the team profile. */
export function MoverTile({
  team,
  value,
  delta,
}: {
  team: string;
  value: number;
  delta: number;
}) {
  if (!team || !Number.isFinite(value) || !Number.isFinite(delta)) return null;

  const up = delta > 0;
  const flat = delta === 0;

  return (
    <div className="flex h-full w-40 min-w-0 flex-col justify-center gap-1 rounded-md border border-border bg-bg-subtle p-2.5 md:w-auto">
      <span className="flex min-w-0 items-center gap-1.5">
        <Flag team={team} size="text-lg" />
        <span className="truncate text-sm font-semibold text-fg">{teamCode(team)}</span>
      </span>
      <span className="flex items-center gap-1.5">
        <span className="tnum text-sm font-semibold text-fg">{simPct(value)}</span>
        <span
          className={cn(
            "tnum rounded-full px-1 text-[9px] font-semibold",
            flat ? "bg-elevated text-muted" : up ? "bg-up-bg text-up" : "bg-down-bg text-down",
          )}
        >
          {up ? "+" : ""}
          {(delta * 100).toFixed(1)}%
        </span>
      </span>
    </div>
  );
}
