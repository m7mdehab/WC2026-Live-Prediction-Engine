"use client";

import { Flag } from "@/components/ui/Flag";
import { cn } from "@/lib/utils";

/**
 * One interactive knockout tie: two team rows, tap the winner to advance. A clean tap-target - no
 * model W/D/L bars (a user-constructed matchup has no model probability), which is why this is its
 * own control rather than the read-only /bracket BracketCell (BracketCell is reused for the static
 * finished bracket in the confirmation summary).
 *
 * A side is `null` when its feeder round hasn't been decided yet → the cell renders a quiet
 * "awaiting previous round" placeholder.
 */
export function PickMatch({
  label,
  teamA,
  teamB,
  picked,
  onPath,
  variant = "sm",
  onPick,
}: {
  label?: string;
  teamA: string | null;
  teamB: string | null;
  picked: string | null;
  onPath?: boolean;
  variant?: "sm" | "final";
  onPick: (team: string) => void;
}) {
  const pending = !teamA || !teamB;

  const shell = cn(
    "rounded-md bg-bg-subtle shadow-[var(--shadow-card)]",
    variant === "final" ? "p-1.5" : "p-1",
    onPath ? "border border-gold ring-1 ring-gold" : "border border-border"
  );

  if (pending) {
    return (
      <div className={cn(shell, "grid place-items-center py-3")}>
        <span className="text-[10px] tracking-wide text-muted uppercase">Awaiting previous round</span>
      </div>
    );
  }

  return (
    <div className={shell} role="group" aria-label={label ?? "Knockout tie"}>
      <SideButton
        team={teamA!}
        selected={picked === teamA}
        isChamp={onPath && picked === teamA}
        variant={variant}
        onPick={() => onPick(teamA!)}
      />
      <div className="my-0.5 h-px bg-border" />
      <SideButton
        team={teamB!}
        selected={picked === teamB}
        isChamp={onPath && picked === teamB}
        variant={variant}
        onPick={() => onPick(teamB!)}
      />
    </div>
  );
}

function SideButton({
  team,
  selected,
  isChamp,
  variant,
  onPick,
}: {
  team: string;
  selected: boolean;
  isChamp?: boolean;
  variant: "sm" | "final";
  onPick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-pressed={selected}
      className={cn(
        "flex w-full items-center gap-1.5 rounded px-1.5 text-left transition-colors",
        variant === "final" ? "py-1.5 text-sm" : "py-1 text-[11px]",
        selected
          ? isChamp
            ? "bg-gold/15 font-semibold text-gold-strong"
            : "bg-confident/10 font-semibold text-fg"
          : "text-secondary hover:bg-elevated hover:text-fg"
      )}
    >
      <Flag team={team} size={variant === "final" ? "text-base" : "text-sm"} link={false} />
      <span className="min-w-0 flex-1 truncate">{team}</span>
      <span
        aria-hidden
        className={cn(
          "grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border",
          selected
            ? isChamp
              ? "border-gold bg-gold text-inverse"
              : "border-confident bg-confident text-inverse"
            : "border-border-strong"
        )}
      >
        {selected ? (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12l5 5L20 6" />
          </svg>
        ) : null}
      </span>
    </button>
  );
}
