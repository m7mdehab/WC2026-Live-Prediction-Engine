import { cn } from "@/lib/utils";

/** Lead-with-one-big-number primitive (design rule: don't bury the lede in tables). */
export function StatValue({
  value,
  label,
  sub,
  accent = "fg",
  className,
}: {
  value: string;
  label?: string;
  sub?: string;
  accent?: "fg" | "confident" | "up" | "down" | "gold";
  className?: string;
}) {
  const color =
    accent === "confident" ? "text-confident"
    : accent === "up" ? "text-up"
    : accent === "down" ? "text-down"
    : accent === "gold" ? "text-gold"
    : "text-fg";
  return (
    <div className={cn("flex flex-col", className)}>
      {label ? (
        <span className="text-xs font-medium tracking-wide text-muted uppercase">{label}</span>
      ) : null}
      <span className={cn("tnum font-display text-3xl leading-tight font-bold", color)}>
        {value}
      </span>
      {sub ? <span className="text-sm text-secondary">{sub}</span> : null}
    </div>
  );
}
