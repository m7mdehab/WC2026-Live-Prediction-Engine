import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase/public";
import { isSeasonFrozen } from "@/lib/data/freeze";
import { freshnessVerdict } from "@/lib/data/health";

// Phase 1.3 -- public freshness health probe for an EXTERNAL uptime monitor (independent of the
// Supabase heartbeat, so a Supabase outage cannot hide itself). Reads the latest monitor_status row
// written by db/freshness_monitor.py and returns a tiny, secret-free summary. 200 when healthy
// (monitor said ok AND the row is fresh); 503 when there is a gap/disagreement, the monitor itself is
// stale (hasn't run), or the read fails -- so an uptime check pages on any of them.
//
// SEASON-AWARE: once the tournament is frozen the monitor is deliberately parked (daily), so its row-age
// no longer signals a stall; a frozen season is healthy unless a real reality-gap exists (health.ts).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const sb = publicClient();
    const [{ data, error }, frozen] = await Promise.all([
      sb
        .from("monitor_status")
        .select("checked_at, ok, gap_count, disagreement_count, flag_count, frontier_size, prod_completed")
        .order("checked_at", { ascending: false })
        .limit(1),
      isSeasonFrozen(),
    ]);
    if (error) throw error;

    const row = data?.[0] as
      | {
          checked_at: string; ok: boolean; gap_count: number; disagreement_count: number;
          flag_count: number; frontier_size: number; prod_completed: number;
        }
      | undefined;

    if (!row) {
      // No row yet (migration just applied / monitor not run). Not healthy, but distinguish it.
      return NextResponse.json(
        { ok: false, status: "no-data", reason: "no monitor_status row yet" },
        { status: 503 }
      );
    }

    const ageMinutes = Math.round((Date.now() - Date.parse(row.checked_at)) / 60_000);
    const { stale, healthy } = freshnessVerdict({
      frozen,
      monitorOk: row.ok,
      ageMinutes,
      gaps: row.gap_count,
      disagreements: row.disagreement_count,
    });

    return NextResponse.json(
      {
        ok: healthy,
        frozen,
        monitorOk: row.ok,
        stale,
        ageMinutes,
        gaps: row.gap_count,
        disagreements: row.disagreement_count,
        flags: row.flag_count,
        frontier: row.frontier_size,
        prodCompleted: row.prod_completed,
        checkedAt: row.checked_at,
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
