"use client";

import { useState } from "react";
import { fmtMetric } from "@/lib/players";
import { cn } from "@/lib/utils";
import type { PaceMetric } from "./pace";

/** Axis ceiling for one metric: the next integer above everything the rail must place (band high,
 *  projection, actual), with headroom so a marker never sits flush on the right edge. Min 1. */
function niceMax(m: PaceMetric): number {
  const raw = Math.max(m.expected, m.bandHigh ?? 0, m.actual, 1);
  const ceil = Math.ceil(raw);
  return raw > ceil - 0.25 ? ceil + 1 : ceil;
}

/** PACE BAND: one fixed-height horizontal band answering "ahead or behind projection". Axis runs
 *  0..niceMax; the projection band (bandLow..bandHigh) is a soft gold fill, the projected value a
 *  gold marker, the player's ACTUAL total a confident dot, and the ahead/behind chip uses the shared
 *  up/down pairing (bg-up-bg text-up / bg-down-bg text-down). The [G|A] toggle is role=tab +
 *  aria-selected (the BracketTabs pattern); a single supported metric renders a static label chip
 *  instead. Honestly framed: the projection is FULL-TOURNAMENT, the actual is to-date ("N matches
 *  logged" caption chip). All rows are fixed-height so toggling never shifts layout. Fail-soft:
 *  no metrics -> renders NOTHING (the profile header is unchanged). */
export function PaceBand({
  metrics,
  matches,
  className,
}: {
  metrics: PaceMetric[];
  /** Matches with logged stats (the to-date caption; the actual dot sums exactly these). */
  matches: number;
  className?: string;
}) {
  const [activeKey, setActiveKey] = useState<string>(metrics[0]?.key ?? "");
  if (metrics.length === 0) return null;
  const m = metrics.find((x) => x.key === activeKey) ?? metrics[0];

  const max = niceMax(m);
  const pos = (v: number): number => Math.max(0, Math.min(100, (v / max) * 100));
  const hasBand = m.bandLow != null && m.bandHigh != null;
  const bandLeft = hasBand ? pos(m.bandLow as number) : 0;
  const bandWidth = hasBand ? Math.max(pos(m.bandHigh as number) - bandLeft, 1) : 0;

  const delta = m.actual - m.expected;
  const ahead = delta >= 0;
  const bandText = hasBand ? ` (${fmtMetric(m.bandLow)}-${fmtMetric(m.bandHigh)})` : "";

  return (
    <section
      role="region"
      aria-label="Pace vs projection"
      data-dash-strip="player-pace"
      className={cn(
        "flex h-[100px] max-w-full flex-col justify-between rounded-md border border-border bg-bg-subtle px-3 py-2",
        className,
      )}
    >
      {/* header row: label + metric toggle on the left, pace + to-date caption chips on the right */}
      <div className="flex h-7 min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[10px] font-medium tracking-wide text-muted uppercase">
            Pace vs projection
          </span>
          {metrics.length > 1 ? (
            <div role="tablist" aria-label="Pace metric" className="flex shrink-0 gap-1">
              {metrics.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={t.key === m.key}
                  onClick={() => setActiveKey(t.key)}
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold transition",
                    t.key === m.key
                      ? "bg-confident text-white"
                      : "bg-elevated text-secondary hover:text-fg",
                  )}
                >
                  {t.key}
                </button>
              ))}
            </div>
          ) : (
            <span className="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold text-secondary">
              {m.key}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span
            className={cn(
              "tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
              ahead ? "bg-up-bg text-up" : "bg-down-bg text-down",
            )}
          >
            {ahead ? "+" : ""}
            {delta.toFixed(1)} {ahead ? "ahead" : "behind"}
          </span>
          <span className="tnum rounded-full bg-elevated px-1.5 py-0.5 text-[10px] font-medium text-muted">
            {matches} matches logged
          </span>
        </div>
      </div>

      {/* the band rail: 0..max axis, projection band fill + projected marker + actual dot */}
      <div
        className="relative h-8"
        role="img"
        aria-label={`${m.key}: actual ${fmtMetric(m.actual)}, full-tournament projection ${fmtMetric(m.expected)}${bandText}, scale 0 to ${max}`}
      >
        <span
          className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-elevated"
          aria-hidden
        />
        {hasBand ? (
          <span
            className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-gold/25"
            style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
            aria-hidden
          />
        ) : null}
        <span
          className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold-strong"
          style={{ left: `${pos(m.expected)}%` }}
          aria-hidden
        />
        <span
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-confident"
          style={{ left: `${pos(m.actual)}%` }}
          aria-hidden
        />
      </div>

      {/* axis + legend row: 0 and the ceiling at the edges, the honest read in the middle */}
      <div className="tnum flex h-4 min-w-0 items-center justify-between gap-2 text-[9px] font-medium text-muted">
        <span>0</span>
        <span className="min-w-0 truncate tracking-wide uppercase">
          act {fmtMetric(m.actual)} &middot; full-tournament proj {fmtMetric(m.expected)}
          {bandText}
        </span>
        <span>{max}</span>
      </div>
    </section>
  );
}
