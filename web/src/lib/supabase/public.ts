import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Cookie-free anon Supabase client for PUBLIC, RLS-protected reads. Unlike lib/supabase/server.ts
 * (which binds request cookies and therefore can't run inside Next's Data Cache), this client uses
 * no request-scoped state, so it is safe inside `unstable_cache`. For an unauthenticated visitor it
 * operates as the exact same `anon` RLS role as the cookie-bound client, so read results are
 * identical - it just unlocks caching. Mirrors the pattern the /teams ISR pages already use.
 *
 * Throws when the env is missing (matches createClient's loud failure) so a misconfiguration can
 * never silently degrade a cached read.
 */
export function publicClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (public read client)."
    );
  }
  return createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
}

/**
 * Like publicClient(), but EVERY read is forced `cache: "no-store"` at the fetch layer, so no caching
 * tier (Next's Data Cache, Next's fetch cache, or an upstream CDN) can hold the response. This is the
 * client for the FRESHNESS ORACLE (lib/data/version.ts): the data-version fingerprint must reflect
 * live prod on every request. If a region ever cached the probe, it would compute a STALE fingerprint,
 * pin every run-stable surface to an old cache key, and serve an old run's forecast while naming the
 * wrong champion - invisible to any single-location check. Correctness over cache-hit-rate: the oracle
 * is two cheap bounded probes per request either way.
 */
export function liveClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY (live read client)."
    );
  }
  return createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
}
