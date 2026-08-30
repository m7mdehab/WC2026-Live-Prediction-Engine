import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import {
  AdminEntryError,
  dispatchRecalc,
  getCurrentRunSummary,
  parseSubmission,
  submitAdminEntry,
} from "@/lib/data/events";

// Protected manual-entry endpoint (scope_lock §2.1 #16, §8, §2.2 #22). Re-checks authorization
// on EVERY request - never trust the page gate alone. Authorize against the Supabase Auth session
// + is_admin(); only then perform the write (the write itself uses the service role inside
// submitAdminEntry, since events grants INSERT to service_role only).
//
// One-touch propagation: after a successful write the route (1) revalidates every result surface
// (belt-and-braces - they are all force-dynamic already) and (2), when the save COMPLETES a match
// (mark_complete=true; never for half-time or event-only edits), fires the recalc workflow via
// GitHub repository_dispatch. The dispatch can never fail the save - its outcome is reported
// truthfully in the response (`recalc`) so the UI shows real status, not a promise.
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

/** Belt-and-braces freshness: every surface that renders raw results or the model run. All of
 *  these are force-dynamic already (fresh per request); /teams uses ISR (revalidate=300), so this
 *  is what makes a just-entered result instant there too. "layout"/"page" cover nested dynamic
 *  routes (/matches/day/[date], /teams/[id]). Post-consolidation: /daily lives under /matches,
 *  /ai-vs-humans under /predict, /bracket under /forecast. */
function revalidateResultSurfaces(matchId: string): void {
  // Freshness comes from the data-version cache key (lib/data/cache.ts): a result write changes the
  // version (match_results count + max entered_at), so every run-stable cached read gets a NEW key
  // and recomputes on the next request - no tag bust needed. These revalidatePath calls drop the
  // route render caches too, belt-and-braces. (The recalc is a Python job; it publishes a new
  // run_id, which likewise changes the version key on its own.)
  revalidatePath("/");
  revalidatePath("/matches");
  revalidatePath(`/match/${matchId}`);
  revalidatePath("/matches/day/[date]", "page");
  revalidatePath("/groups");
  revalidatePath("/predict");
  revalidatePath("/forecast");
  revalidatePath("/methodology");
  revalidatePath("/teams", "layout");
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
    const sub = parseSubmission(body);
    const result = await submitAdminEntry(sub, auth.email);

    // The write succeeded - everything from here on must not fail the response.
    try {
      revalidateResultSurfaces(sub.match_id);
    } catch (err) {
      console.error("admin entry: revalidation failed (result is saved):", err);
    }

    // Auto recalc: ONLY when this save marks the match finished. dispatchRecalc never throws and
    // is bounded by a short timeout, so the save response stays fast and truthful either way.
    const recalc = sub.mark_complete ? await dispatchRecalc(sub.match_id) : null;

    return NextResponse.json({ ...result, recalc });
  } catch (err) {
    if (err instanceof AdminEntryError) {
      return NextResponse.json({ ok: false, error: err.message }, { status: err.status });
    }
    console.error("admin entry failed:", err);
    return NextResponse.json({ ok: false, error: "write failed" }, { status: 500 });
  }
}

/** Status poll for the admin UI: the current published run. The form records the run visible at
 *  submit time, then polls this until a NEWER run (fresh created_at, different run_id) appears -
 *  that is the proof the triggered recalc actually published. */
export async function GET() {
  const auth = await authorize();
  if ("error" in auth) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }
  try {
    const run = await getCurrentRunSummary();
    return NextResponse.json({ ok: true, run });
  } catch (err) {
    console.error("admin status read failed:", err);
    return NextResponse.json({ ok: false, error: "status read failed" }, { status: 500 });
  }
}
