import { NextResponse } from "next/server";
import { liveClient } from "@/lib/supabase/public";

// Minimal, genuinely-uncached live run-id probe for the CLIENT-side forecast freshness check (Track C).
// The /forecast page is now static/ISR, so the "is this board behind the latest published run" comparison
// can no longer be a no-store read INSIDE the server render (that is exactly what forced the route dynamic).
// It moved to the client, which polls this tiny endpoint after hydration. force-dynamic + no-store so it
// always reflects the latest published run - the human-visible safety net that a static board never
// silently serves a superseded champion. Fail-soft to { runId: null } (the client then shows no banner).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  try {
    const sb = liveClient();
    const { data, error } = await sb.from("current_run").select("run_id").limit(1);
    if (error) throw error;
    const runId = (data?.[0] as { run_id: string } | undefined)?.run_id ?? null;
    return NextResponse.json({ runId }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ runId: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
