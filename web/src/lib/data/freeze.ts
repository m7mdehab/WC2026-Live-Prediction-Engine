import "server-only";
import { cache } from "react";
import { unstable_cache } from "next/cache";
import { liveClient } from "@/lib/supabase/public";

// Season-freeze detection for the Data Cache TTL (egress control).
//
// WHY: post-tournament the freshness fingerprint (lib/data/version.ts) is PERMANENTLY stable - no run
// or result will ever publish again - so every run-stable cache key is fixed forever. The 60s live TTL
// then buys nothing (there is no write for it to bound the staleness of) and costs everything: it
// forces a full re-read of a permanently immutable dataset from Postgres every 60s, per key, per
// region. That re-read is the dominant Supabase egress. When the season is frozen we raise the TTL to
// a week, collapsing those re-reads by ~4 orders of magnitude. It stays correct because the version
// key is the PRIMARY freshness guarantee: any write (even the impossible one) changes the fingerprint
// -> a new key -> an instant miss -> a fresh read, regardless of how long the old entry's TTL was.
//
// SELF-ADJUSTING (no hardcoded date): the freeze is the SAME data predicate decideTick uses to park
// the heartbeat - a run has published AND every fixture is completed. A new tournament re-seeds open
// fixtures and this reverts to the live TTL automatically; a transient empty-fixtures read can never
// pin the long TTL (the totalFixtures>0 guard); a probe error fails to the LIVE TTL, never the frozen
// one, so a blip can only ever cost freshness, never over-cache.

export const LIVE_TTL_SECONDS = 60; // bounds staleness of an events-only admin edit that doesn't move the fingerprint
export const FROZEN_TTL_SECONDS = 604_800; // 7 days: no write can land, so this only trades egress for nothing lost

// The freshness/freeze oracle Data-Cache TTL (Track C: the static seal). BOUNDED to <= the LIVE data TTL,
// so a cached oracle answer can never be staler than the data it gates - the protection preserved is
// BOUNDEDNESS, not uncachedness (the original bug was UNBOUNDED region-pinned staleness). Folding the
// build id into the oracle key (below, and in version.ts) means every deployment busts it. While the
// season is frozen the oracle answer is constant, so caching it is byte-identical; for a future LIVE
// season it adds at most a ~60s propagation delay on the automatic path - no worse than this same TTL,
// which already bounds live data staleness. Exported so the ship-condition test can assert the bound.
export const ORACLE_TTL_SECONDS = LIVE_TTL_SECONDS;
/** The deployment build id, folded into the oracle cache key so every deploy busts the cached answer. */
export const ORACLE_BUILD = process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";

/** PURE freeze predicate (unit-tested): a run has published, at least one fixture exists, and every
 *  fixture is completed. Mirrors decideTick's seasonOver exactly. Positive evidence only - absence or
 *  an empty read is NOT frozen. */
export function isFrozen(hasRun: boolean, totalFixtures: number, openFixtures: number): boolean {
  return hasRun && totalFixtures > 0 && openFixtures === 0;
}

/** PURE TTL selector (unit-tested): frozen -> a week; live -> 60s. Frozen is strictly the longer. */
export function ttlFor(frozen: boolean): number {
  return frozen ? FROZEN_TTL_SECONDS : LIVE_TTL_SECONDS;
}

/**
 * Live freeze probe. React-cached, so it runs at most once per request no matter how many cached reads
 * a page performs. Three tiny live reads in ONE round-trip: a one-row run check and two HEAD counts
 * (head:true transfers no rows, only the Content-Range total), so it adds negligible egress while
 * unlocking the frozen TTL for every heavy read. Reads through liveClient (cache:"no-store") for the
 * same reason version.ts does: the freeze signal must reflect live prod, never a pinned region.
 * Fail-soft to NOT frozen on ANY error -> a blip degrades to the live TTL, never over-caches.
 */
// The uncached freeze probe. THROWS on any probe error so unstable_cache never caches a failure (a blip
// must never pin a frozen verdict; it degrades to the live TTL per-request until the probe succeeds).
async function probeSeasonFrozen(): Promise<boolean> {
  const sb = liveClient();
  const [run, open, total] = await Promise.all([
    sb.from("current_run").select("run_id").limit(1),
    sb.from("fixtures").select("match_id", { count: "exact", head: true }).neq("status", "completed"),
    sb.from("fixtures").select("match_id", { count: "exact", head: true }),
  ]);
  if (run.error || open.error || total.error) throw new Error("freeze probe error");
  const hasRun = (run.data?.length ?? 0) > 0;
  return isFrozen(hasRun, total.count ?? 0, open.count ?? 0);
}

export const isSeasonFrozen = cache(async (): Promise<boolean> => {
  try {
    // BOUNDED Data-Cache layer (Track C): the probe runs at most once per ORACLE_TTL_SECONDS (<= the
    // live data TTL) per deployment, instead of on every request - so the route no longer opts out of
    // static rendering while the freeze signal can never be staler than the data it gates.
    return await unstable_cache(probeSeasonFrozen, ["season-frozen", ORACLE_BUILD], {
      revalidate: ORACLE_TTL_SECONDS,
    })();
  } catch {
    // Fail-soft to NOT frozen (the live TTL). The throw above kept the failure OUT of the cache, so the
    // next request retries; a blip only ever costs freshness, never over-caches.
    return false;
  }
});
