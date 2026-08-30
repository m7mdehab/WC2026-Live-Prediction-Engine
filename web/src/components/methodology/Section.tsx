import { cn } from "@/lib/utils";

/** A numbered methodology section: anchor target, eyebrow index, heading, optional lede. */
export function Section({
  id,
  index,
  title,
  lede,
  children,
  className,
}: {
  id: string;
  index: number;
  title: string;
  lede?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20", className)}>
      <div className="mb-4">
        <div className="mb-1 flex items-baseline gap-2">
          <span className="tnum font-mono text-xs font-semibold text-confident">
            {String(index).padStart(2, "0")}
          </span>
          <h2 className="font-display text-xl font-bold tracking-tight text-fg sm:text-2xl">
            {title}
          </h2>
        </div>
        {lede ? <p className="max-w-prose text-sm text-secondary">{lede}</p> : null}
      </div>
      {children}
    </section>
  );
}

/** Lightweight labelled fact, used in the dense parameter grids. */
export function Fact({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-md border border-border bg-bg-subtle p-3">
      <div className="text-[11px] font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="tnum mt-0.5 font-display text-lg font-semibold text-fg">{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-secondary">{sub}</div> : null}
    </div>
  );
}
