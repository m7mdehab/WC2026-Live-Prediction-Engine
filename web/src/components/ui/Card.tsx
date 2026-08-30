import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  as: Tag = "div",
  padding = "p-4",
}: {
  children: React.ReactNode;
  className?: string;
  as?: React.ElementType;
  /** The padding utility (default "p-4"). Override for the phone-dense list surfaces, e.g.
   *  "p-3 sm:p-4" (tighter at the base breakpoint, roomier from sm up). Kept as an explicit prop
   *  rather than a className override because the plain `cn` combiner does not de-dupe Tailwind
   *  padding utilities, so two `p-*` classes would otherwise both ship. */
  padding?: string;
}) {
  return (
    <Tag
      className={cn(
        "rounded-card border border-border bg-surface shadow-[var(--shadow-card)]",
        padding,
        className
      )}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between">
      <h3 className="font-display text-sm font-semibold tracking-wide text-secondary uppercase">
        {title}
      </h3>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}
