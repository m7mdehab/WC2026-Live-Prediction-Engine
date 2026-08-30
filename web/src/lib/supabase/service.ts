import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client - server-only, RLS-bypassing. Used exclusively by the /admin
 * write path (after the request has been authorized against the session + is_admin()), because
 * the events table grants INSERT to service_role only (db/schema_g.sql). Authorization happens
 * in app code first; this client then performs the actual match_results + events + audit writes,
 * mirroring db/enter_result.py's service_client().
 *
 * SUPABASE_SERVICE_ROLE_KEY is a secret - never NEXT_PUBLIC, never shipped to the browser.
 */
export function createServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (server-only). " +
        "Set them in web/.env.local (and the Vercel project env, as a secret)."
    );
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** True only when the service role key is configured (lets the dev-preview path skip live writes). */
export function hasServiceRole(): boolean {
  return !!process.env.SUPABASE_SERVICE_ROLE_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL;
}
