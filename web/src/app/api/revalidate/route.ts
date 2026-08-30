import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { presentedSecret, secretMatches } from "@/lib/http/secret";
import { applyRevalidation } from "@/lib/data/surfaces";

// Phase 1.4 -- LIGHTWEIGHT, secret-gated revalidation for the AUTO pipeline. The recalc workflow
// curls this after publishing so the ISR surfaces (/teams, /teams/[id]) refresh immediately instead
// of lagging up to 5 min -- WITHOUT triggering a heavyweight full Vercel redeploy per cycle (the old
// deploy-hook approach). Force-dynamic surfaces are already instant via the data-version key; this
// busts them too as belt-and-braces.
//
// Secret: REVALIDATE_SECRET, falling back to CRON_TICK_SECRET (same trust domain -- the pipeline).
// Unconfigured -> 503 (fail closed). Wrong/absent -> 401. The secret is never logged or echoed.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function expectedSecret(): string | undefined {
  return process.env.REVALIDATE_SECRET || process.env.CRON_TICK_SECRET;
}

async function handle(req: Request): Promise<NextResponse> {
  const expected = expectedSecret();
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "REVALIDATE_SECRET / CRON_TICK_SECRET not configured" },
      { status: 503 }
    );
  }
  if (!secretMatches(presentedSecret(req), expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const revalidated = applyRevalidation((p, t) => (t ? revalidatePath(p, t) : revalidatePath(p)));
  return NextResponse.json({ ok: true, revalidated });
}

export async function POST(req: Request) {
  return handle(req);
}
export async function GET(req: Request) {
  return handle(req);
}
