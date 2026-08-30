import { NextResponse } from "next/server";
import { publicClient } from "@/lib/supabase/public";
import { dispatchRecalc } from "@/lib/data/events";
import { decideTick, type TickFixture } from "@/lib/cron/tick";
import { presentedSecret, secretMatches } from "@/lib/http/secret";

// Phase 1.1 -- the RELIABLE HEARTBEAT endpoint. A Supabase pg_cron job (db/sql/heartbeat_pg_cron.sql)
// pings this every few minutes via pg_net.http_post with a shared secret. We replace GitHub's
// throttled `schedule:` as the PRIMARY trigger while the heavy Monte Carlo stays in GitHub Actions:
// on a dispatch decision this route fires the SAME proven repository_dispatch the /admin save uses.
//
// Safety:
//   * Secret-gated: a missing/incorrect secret is rejected (401); an UNCONFIGURED secret fails CLOSED
//     (503) so a deploy without CRON_TICK_SECRET never accepts an unauthenticated tick.
//   * Read-only here: the route only READS fixtures + the last run (anon client) and fires a
//     dispatch; it never writes. The gated writer (db/ingest_results.py) runs inside the workflow.
//   * Idempotent: decideTick() dampens redundant ticks; a double-tick cannot double-write because
//     the gated writer only writes a FINISHED-not-in-prod result and recalc publishes atomically.
//   * The secret is read ONLY from process.env and is NEVER logged or echoed into a response.
export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // needs node:crypto (via @/lib/http/secret) for the timing-safe compare

async function handle(req: Request): Promise<NextResponse> {
  const expected = process.env.CRON_TICK_SECRET;
  if (!expected) {
    // Fail CLOSED: never accept a tick when the secret is not configured.
    return NextResponse.json(
      { ok: false, error: "CRON_TICK_SECRET not configured" },
      { status: 503 }
    );
  }
  if (!secretMatches(presentedSecret(req), expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const now = new Date().toISOString(); // captured ONCE, passed into the pure decision (deterministic)

  // Read the live state (anon RLS, identical to a visitor). Both reads are best-effort; a read
  // failure must not crash the heartbeat -- we still fail OPEN to a floor dispatch so a transient
  // Supabase blip can never silently stall the pipeline.
  let fixtures: TickFixture[] = [];
  let lastRunAt: string | null = null;
  let readError: string | null = null;
  try {
    const sb = publicClient();
    const [fx, run] = await Promise.all([
      // scaling-guard-ok: fixtures is bounded by the tournament (<=104 rows, the full match calendar)
      sb.from("fixtures").select("kickoff_utc, status"),
      sb.from("current_run").select("created_at").limit(1),
    ]);
    if (fx.error) throw fx.error;
    fixtures = (fx.data ?? []) as TickFixture[];
    lastRunAt = ((run.data?.[0] as { created_at?: string } | undefined)?.created_at) ?? null;
  } catch (err) {
    readError = err instanceof Error ? err.message : "read failed";
  }

  // On a read failure we cannot evaluate windows/floor: fail OPEN with an empty fixture set + null
  // lastRunAt -> decideTick returns floor-due dispatch (lastRunAt null => "never" => floor).
  const decision = decideTick({ fixtures, lastRunAt, now });

  let dispatched: { triggered: boolean; reason: string | null } | null = null;
  if (decision.dispatch) {
    // Reuse the proven dispatcher; "cron:tick" is a sentinel match_id the workflow simply logs (the
    // player-ingest step iterates mapped+completed fixtures, so a sentinel id ingests nothing extra).
    dispatched = await dispatchRecalc("cron:tick");
  }

  return NextResponse.json({
    ok: true,
    now,
    readError, // surfaced (not thrown) so the heartbeat is observable even on a transient read blip
    decision,
    dispatched,
  });
}

// pg_net issues POST; allow GET too for an external uptime probe / manual curl (same secret gate).
export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
