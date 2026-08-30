import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { liveClient } from "@/lib/supabase/public";
import { ORACLE_TTL_SECONDS, ORACLE_BUILD } from "@/lib/data/freeze";

/**
 * The "data version" of the public site: a cheap fingerprint that changes whenever the cached read
 * results could change. It folds the current model run id together with a fingerprint of
 * match_results (row count + the latest entered_at) AND a fingerprint of player_match_stats (same
 * shape). So it changes when ANY of:
 *   - a new model run publishes (recalc) → run_id changes, OR
 *   - an admin enters/edits a result → match_results count or max(entered_at) changes
 *     (events.ts stamps entered_at = now() on every write, including updates), OR
 *   - a player-stat write lands → player_match_stats count or max(entered_at) changes (busts the
 *     player caches exactly like a result busts the rest).
 *
 * The player_match_stats probe is isolated in its OWN try/catch that defaults to "" on ANY failure
 * (e.g. the table not yet created). This module is SAFE TO DEPLOY BEFORE the schema_i migration is
 * applied: a missing player table degrades to an empty player fingerprint and can NEVER disable the
 * global cache (it would only ever fall back to the original run+results fingerprint).
 *
 * This string is folded into every run-stable cache key (lib/data/cache.ts), so a write yields a
 * NEW key on the very next request → the cache misses → fresh recompute. That is what preserves
 * instant propagation: freshness does not depend on a revalidate call firing, only on this version
 * changing, which it provably does on any run/result write.
 *
 * Wrapped in React cache() so the probe runs once per request even when a page reads several cached
 * fns. It is intentionally NOT in the Data Cache - it is the freshness oracle and must be live, so it
 * reads through liveClient() (fetch cache: "no-store"): no tier may pin a region to a stale
 * fingerprint and thereby serve an old run's forecast (the /forecast-named-the-wrong-champion class).
 */
// The uncached fingerprint probe. THROWS on a main-probe error (run / match_results) so unstable_cache
// never caches a failure - a probe blip must never pin an unknown/partial version; the caller returns a
// per-request-unique token instead (correctness over cache-hit). The player-stats segment still degrades
// to "" on its own, independently.
async function probeDataVersion(): Promise<string> {
  {
    const sb = liveClient();
    // The fingerprint of each results table is (row count, latest entered_at). DO NOT full-read it:
    // this oracle runs on EVERY request, and a plain select is capped at 1000 rows by PostgREST -- so
    // once player_match_stats passes 1000 rows BOTH the length AND the max(entered_at) of a full read
    // FREEZE (writes beyond row 1000 are invisible), the version stops changing, and the leaderboard
    // cache would stop busting on new player-stat writes. Instead probe each table with a HEAD count
    // (count:"exact", head:true -> no rows transferred, exact total) plus a one-row max via
    // .order(entered_at desc).limit(1). That is bounded (two cheap reads per table) AND correct as the
    // table grows. All probes run in ONE round-trip. supabase-js resolves a missing table / RLS denial
    // to {data:null,error} rather than throwing, so player_match_stats being absent never rejects.
    const [run, resCount, resMax, psCount, psMax] = await Promise.all([
      sb.from("current_run").select("run_id").limit(1),
      sb.from("match_results").select("entered_at", { count: "exact", head: true }),
      sb.from("match_results").select("entered_at").order("entered_at", { ascending: false }).limit(1),
      sb.from("player_match_stats").select("entered_at", { count: "exact", head: true }),
      sb.from("player_match_stats").select("entered_at").order("entered_at", { ascending: false }).limit(1),
    ]);
    // A main-probe error must NOT be cached under a partial fingerprint - throw so the caller emits a
    // per-request-unique token. (The player-stats probes are handled separately below, degrade to "".)
    if (run.error || resCount.error || resMax.error) throw new Error("data-version probe error");
    const runId = (run.data?.[0] as { run_id: string } | undefined)?.run_id ?? "no-run";
    const resN = resCount.count ?? 0;
    const maxEntered = (resMax.data?.[0] as { entered_at: string } | undefined)?.entered_at ?? "";

    // Player-stats fingerprint - ISOLATED so a missing table or RLS error degrades to "" (never the
    // global probe-failed fallback). The version is then exactly the original run+results fingerprint
    // with an empty player segment appended. Both player probes must succeed to contribute a segment.
    let playerPart = "";
    if (!psCount.error && !psMax.error) {
      const pN = psCount.count ?? 0;
      const pMax = (psMax.data?.[0] as { entered_at: string } | undefined)?.entered_at ?? "";
      playerPart = `${pN}|${pMax}`;
    }

    return `${runId}|${resN}|${maxEntered}|p:${playerPart}`;
  }
}

export const dataVersion = cache(async (): Promise<string> => {
  try {
    // BOUNDED Data-Cache layer (Track C): the fingerprint probe runs at most once per ORACLE_TTL_SECONDS
    // (<= the live data TTL) per deployment instead of on every request, so a cachedRead route is no
    // longer forced dynamic - while a cached fingerprint can never be staler than the data it gates. Any
    // write still changes the fingerprint on the next probe, and the build id busts it on every deploy.
    return await unstable_cache(probeDataVersion, ["data-version", ORACLE_BUILD], {
      revalidate: ORACLE_TTL_SECONDS,
    })();
  } catch {
    // Probe failed -> a per-request-unique token so we never serve a cache entry under an unknown
    // version. The throw inside probeDataVersion kept the failure OUT of the cache.
    return `probe-failed|${Date.now()}`;
  }
});
