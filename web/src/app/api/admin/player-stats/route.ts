import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  AdminEntryError,
  parsePlayerStatSubmission,
  submitPlayerStat,
} from "@/lib/data/events";

// Protected MANUAL player-stat override (Phase 4). Same auth/allowlist gate as the score-entry
// route (/api/admin): re-checks authorization on EVERY request - never trust the page gate alone.
// A write here is source='manual', locked=true (the system of record). The best-effort FotMob
// ingester (db/ingest_player_stats.py) reads source/locked first and NEVER clobbers a manual row,
// so a value entered here is guaranteed correct regardless of what the scraper later sees.
//
// On success we revalidate the player surfaces (mirrors the score entry's revalidateResultSurfaces).
export const dynamic = "force-dynamic";

/** Dev-only, non-production preview bypass (matches lib/data/events.ts isLocalPreview). */
function isLocalPreview(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ADMIN_LOCAL_PREVIEW === "1";
}

async function authorize(): Promise<{ email: string } | { error: string; status: number }> {
  if (isLocalPreview()) return { email: "preview@local" };

  let sb;
  try {
    sb = await createClient();
  } catch {
    return { error: "auth unavailable", status: 401 };
  }

  const { data, error } = await sb.auth.getUser();
  if (error || !data.user?.email) return { error: "not authenticated", status: 401 };

  const admin = await sb.rpc("is_admin");
  if (admin.error || !admin.data) return { error: "not authorized", status: 403 };

  return { email: data.user.email };
}

/** Revalidate every surface that renders player stats. /players and /player/[id] are the Phase 5
 *  player surfaces (revalidating a not-yet-existing route is a harmless no-op); the per-match page
 *  shows in-match player lines, and the home/match surfaces may surface top performers. */
function revalidatePlayerSurfaces(matchId: string): void {
  revalidatePath("/players");
  revalidatePath("/players/[id]", "page");
  revalidatePath("/player/[id]", "page");
  revalidatePath(`/match/${matchId}`);
  revalidatePath("/matches/day/[date]", "page");
  revalidatePath("/");
}

export async function POST(req: Request) {
  const auth = await authorize();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
  }

  try {
    const sub = parsePlayerStatSubmission(body);
    const result = await submitPlayerStat(sub, auth.email);

    // The write succeeded - nothing from here on may fail the response.
    try {
      revalidatePlayerSurfaces(sub.match_id);
    } catch (err) {
      console.error("player-stat entry: revalidation failed (row is saved):", err);
    }

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AdminEntryError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error("player-stat entry failed:", err);
    return NextResponse.json({ ok: false, error: "write failed" }, { status: 500 });
  }
}
