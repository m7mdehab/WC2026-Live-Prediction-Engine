import "server-only";
import { unstable_cache } from "next/cache";
import { dataVersion } from "./version";
import { isSeasonFrozen, ttlFor } from "./freeze";

// The deployment's git SHA. Folded into every cache key so a NEW deployment always misses the cache
// on its first read per key/region and recomputes - the ONLY in-app way to propagate a change to the
// OUTPUT of a cached read once the tournament is frozen. Without it, the version key is permanently
// stable, the tag bust never fires again (no admin write will land), and FROZEN_TTL_SECONDS is a week:
// a corrected retrospective / players / group-fate render would take up to seven days to appear, with
// no lever to force it. Vercel sets VERCEL_GIT_COMMIT_SHA at build; "dev" locally (stable, so local
// dev keeps caching). Cost is one cold read per key/region per deployment - deploys are rare and the
// frozen-TTL egress win is preserved in full.
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA ?? "dev";

/** The Data Cache key parts for a run-stable read: (keyBase, live data-version, deployment build).
 *  Pure + exported so the invariant "a new deployment changes the key" is unit-tested directly. */
export function cacheKeyParts(keyBase: string, version: string, build: string): string[] {
  return [keyBase, version, build];
}

// Belt-and-braces TTL. The data-version in the key is the PRIMARY freshness guarantee (a write
// changes the version → a new key → a miss → fresh). This ceiling only bounds the rare edge the
// fingerprint doesn't cover (e.g. an events-only admin edit with no score change).
//
// The TTL is SEASON-AWARE (see lib/data/freeze.ts): ~60s while the tournament is live (to bound that
// events-only edge), and a week once every fixture is final (no write can ever land again, so the
// short ceiling would only force a full re-read of a permanently immutable dataset every 60s - the
// dominant Supabase egress). It reverts automatically when a new tournament seeds open fixtures.

/**
 * Cache a run-stable read in Next's Data Cache, keyed by (keyBase + the live data-version). Because
 * the version is part of the cache KEY (keyParts), any new run or recorded result yields a fresh key
 * and recomputes on the very next request - instant propagation is preserved by construction.
 *
 * The wrapped fn MUST use the cookie-free publicClient() (no request-scoped APIs inside the Data
 * Cache) and return JSON-serializable data. Routes stay force-dynamic, so the route itself always
 * re-runs; only the expensive derived read is served from cache.
 *
 * @param keyBase  stable identifier for the read (include any arg, e.g. `match-detail:M001`)
 * @param tags     revalidateTag tags (busted belt-and-braces by the admin write path)
 * @param fn       the uncached read (cookie-free client)
 */
export async function cachedRead<T>(keyBase: string, tags: string[], fn: () => Promise<T>): Promise<T> {
  // Both probes are React-cached, so this resolves to one shared round-trip per request regardless of
  // how many cached reads a page performs.
  const [version, frozen] = await Promise.all([dataVersion(), isSeasonFrozen()]);
  return unstable_cache(fn, cacheKeyParts(keyBase, version, BUILD), { tags, revalidate: ttlFor(frozen) })();
}

// Tag vocabulary - the admin write path revalidates these as a secondary bust (the version key is
// the primary one). "run" covers every run-stable surface; the rest are finer-grained.
export const TAGS = {
  run: "run",
  forecast: "forecast",
  bracket: "bracket",
  groups: "groups",
  matches: "matches",
  predict: "predict",
  home: "home",
  methodology: "methodology",
  players: "players",
} as const;
