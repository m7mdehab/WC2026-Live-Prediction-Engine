"use client";

import { useEffect, useState } from "react";
import { ForecastFreshnessNote } from "./ForecastFreshnessNote";
import { isForecastStale } from "@/lib/data/forecastFreshness";
import type { ModelPredictionRun } from "@/lib/types";

/**
 * CLIENT-side forecast freshness check (Track C, the static seal). The /forecast server render is now
 * static/ISR, so the live run-id comparison that used to run in the server component (a no-store read that
 * forced the route dynamic) moved here: after hydration this fetches the genuinely-uncached /api/live-run
 * and, if the live run diverges from the run this board was RENDERED against, shows the ForecastFreshnessNote.
 *
 * The safety net is preserved and, if anything, more visible: a static board that has fallen behind a newer
 * run now surfaces the same banner, driven by a real live probe on every page view. Fetch failure or a
 * still-loading state shows NO banner (fail-soft; a freshness check must never FALSE-alarm). Zero-CLS: the
 * note occupies no space until it fires.
 */
export function ForecastFreshnessClient({ run }: { run: ModelPredictionRun | null }) {
  const [liveRunId, setLiveRunId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/live-run", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { runId?: string | null } | null) => {
        if (alive && j) setLiveRunId(j.runId ?? null);
      })
      .catch(() => {
        /* fail-soft: no live id -> no banner (never a false alarm) */
      });
    return () => {
      alive = false;
    };
  }, []);

  // isForecastStale is pure + client-safe: stale only when BOTH ids are known and differ.
  const stale = isForecastStale(run?.run_id, liveRunId);
  return <ForecastFreshnessNote stale={stale} run={run} />;
}
