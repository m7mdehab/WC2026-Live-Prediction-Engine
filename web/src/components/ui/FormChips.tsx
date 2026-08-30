import { Flag } from "@/components/ui/Flag";
import { cn } from "@/lib/utils";
import type { FormMatch } from "@/lib/types";

const CHIP: Record<"W" | "D" | "L", string> = {
  W: "bg-up-bg text-up",
  D: "bg-elevated text-secondary",
  L: "bg-down-bg text-down",
};

/** A team's last-N competitive results as color-coded W/D/L chips (most-recent first).
 *  Chips are the literal stored results from match_factors.recent_form - nothing derived. */
export function FormChips({
  team,
  form,
  className,
}: {
  team: string;
  form: FormMatch[];
  className?: string;
}) {
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <Flag team={team} size="text-sm" link={false} />
      <span className="w-20 shrink-0 truncate text-[11px] font-medium text-secondary">{team}</span>
      <div className="flex gap-1">
        {form.length === 0 ? (
          <span className="text-[11px] text-muted">no recent matches</span>
        ) : (
          form.map((m, i) => (
            <span
              key={`${m.date}-${i}`}
              className={cn(
                "grid h-4 w-4 place-items-center rounded-[3px] text-[9px] font-bold",
                CHIP[m.result]
              )}
              title={`${m.date}: ${m.result} ${m.score} vs ${m.opponent}${
                m.opponent_rank ? ` (#${m.opponent_rank})` : ""
              }`}
              aria-label={`${m.result} ${m.score} versus ${m.opponent}`}
            >
              {m.result}
            </span>
          ))
        )}
      </div>
    </div>
  );
}
