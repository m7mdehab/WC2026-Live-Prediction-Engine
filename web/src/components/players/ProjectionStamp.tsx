import { cn } from "@/lib/utils";
import type { ProjectionMeta } from "@/lib/types/players";

/** Human-format an ISO timestamp like "2026-06-18T12:26:35Z" to "18 Jun 2026".
 *  Returns null for missing/unparseable input so the caller can degrade. */
function formatAsOf(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  // Stable, locale-fixed format (UTC) so server render is deterministic and not flickery.
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/** Human-format the cond label: "cond24" -> "24 results". null/unknown -> null. */
function formatCond(condLabel: string | null): string | null {
  if (!condLabel) return null;
  const m = /^cond(\d+)$/i.exec(condLabel.trim());
  if (m) {
    const n = Number(m[1]);
    return `${n} result${n === 1 ? "" : "s"}`;
  }
  return condLabel; // already human-ish; surface as-is rather than dropping it
}

/** The honest "projections as of <date>, conditioned on <N results>" freshness stamp.
 *
 *  Degrades gracefully:
 *   - meta null / no date          -> "Projections: latest available"
 *   - date present, cond null      -> "Projections as of <date>"
 *   - both present                 -> "Projections as of <date>, conditioned on <N results>"
 *  Never renders the literal "null" / "NaN". */
export function ProjectionStamp({
  meta,
  className,
}: {
  meta: ProjectionMeta | null;
  className?: string;
}) {
  const asOf = formatAsOf(meta?.asOfDate ?? null);
  const cond = formatCond(meta?.condLabel ?? null);

  let label: string;
  if (!asOf) {
    label = "Projections: latest available";
  } else if (cond) {
    label = `Projections as of ${asOf}, conditioned on ${cond}`;
  } else {
    label = `Projections as of ${asOf}`;
  }

  return (
    <p
      className={cn(
        "tnum inline-flex items-center gap-1.5 text-[11px] font-medium text-muted",
        className
      )}
    >
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-confident" aria-hidden />
      {label}
    </p>
  );
}
