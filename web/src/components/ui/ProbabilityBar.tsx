import { cn } from "@/lib/utils";
import { simPct } from "@/lib/utils";

type Variant = "confident" | "up" | "down" | "upset" | "neutral" | "gold";

const FILL: Record<Variant, string> = {
  confident: "bg-confident",
  up: "bg-up",
  down: "bg-down",
  upset: "bg-upset",
  neutral: "bg-neutral",
  gold: "bg-gold",
};

/** Horizontal probability bar (value in [0,1]). Single flat fill - no gradients. */
export function ProbabilityBar({
  value,
  variant = "confident",
  showValue = true,
  className,
}: {
  value: number | null | undefined;
  variant?: Variant;
  showValue?: boolean;
  className?: string;
}) {
  const v = Math.max(0, Math.min(1, value ?? 0));
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
        <div
          className={cn("h-full rounded-full transition-[width]", FILL[variant])}
          style={{ width: `${v * 100}%` }}
        />
      </div>
      {showValue ? (
        <span className="tnum w-12 shrink-0 text-right text-xs font-medium text-secondary">
          {simPct(value)}
        </span>
      ) : null}
    </div>
  );
}
