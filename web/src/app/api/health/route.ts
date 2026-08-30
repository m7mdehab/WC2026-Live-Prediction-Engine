import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase/public";
import { isSeasonFrozen } from "@/lib/data/freeze";
import { healthVerdict } from "@/lib/data/health";

// Phase 4.2 -- general pipeline health (secret-free, public). Summarises the latest model run, the
// completed-results count, and the freshness monitor's latest verdict. 200 when healthy; 503 when the
// run is stale (pipeline likely stalled), the monitor reported not-ok, or the read fails -- so an
// uptime probe pages. Complements GET /api/health/freshness (which focuses on the reality gap).
//
// SEASON-AWARE: once the tournament is frozen (a run published AND every fixture final), the final
// run's age grows forever and the freshness monitor is parked - both by design. So a frozen season
// with a published run is HEALTHY, not stalled; only a real reality-gap still pages (see lib/data/health.ts).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const sb = publicClient();
    const [run, res, mon, frozen] = await Promise.all([
      sb.from("current_run").select("run_id, created_at, conditioned_on_results").limit(1),
      sb.from("match_results").select("match_id", { count: "exact", head: true }).eq("status", "completed"),
      sb.from("monitor_status").select("checked_at, ok, gap_count, disagreement_count")
        .order("checked_at", { ascending: false }).limit(1),
      isSeasonFrozen(),
    ]);

    const runRow = run.data?.[0] as
      | { run_id: string; created_at: string; conditioned_on_results?: number }
      | undefined;
    const runAgeH = runRow ? (Date.now() - Date.parse(runRow.created_at)) / 3_600_000 : null;

    const monRow = mon.data?.[0] as
      | { checked_at: string; ok: boolean; gap_count: number; disagreement_count: number }
      | undefined;

    const { runStale, healthy } = healthVerdict({
      hasRun: !!runRow,
      runAgeHours: runAgeH,
      frozen,
      monitorOk: monRow ? monRow.ok : null,
      monitorGaps: monRow?.gap_count ?? null,
      monitorDisagreements: monRow?.disagreement_count ?? null,
    });

    return NextResponse.json(
      {
        ok: healthy,
        frozen,
        run: runRow
          ? {
              runId: runRow.run_id,
              ageHours: runAgeH == null ? null : Math.round(runAgeH * 10) / 10,
              conditionedOn: runRow.conditioned_on_results ?? null,
            }
          : null,
        runStale,
        completedResults: res.count ?? null,
        monitor: monRow
          ? { ok: monRow.ok, gaps: monRow.gap_count, disagreements: monRow.disagreement_count, checkedAt: monRow.checked_at }
          : null,
      },
      { status: healthy ? 200 : 503 }
    );
  } catch (err) {
    return NextResponse.json(
      { ok: false, status: "error", reason: err instanceof Error ? err.message : "read failed" },
      { status: 503 }
    );
  }
}
