/**
 * /forecast freshness cross-check (Phase 1). A pure, client-safe predicate: is the forecast payload
 * the site RENDERED behind the LATEST published run, or is it a stale cache entry?
 *
 * The /forecast route is force-dynamic, but the derived forecast read is served from Next's regional
 * Data Cache keyed by the data-version fingerprint. If any tier ever pins a region to a stale
 * fingerprint, that region can serve an OLD run's forecast while naming an OLD champion - invisible to
 * any single-location check (the incident: some edges showed "cond 76 / Argentina" days after the
 * Final). This compares the run_id actually rendered against a fresh, uncached read of
 * current_run.run_id: a mismatch means the served board is behind live and must SAY SO.
 *
 * Stale ONLY when both ids are known AND differ. An unknown live id (a probe failure) is NOT stale: we
 * never cry stale on our own read failing, only on a proven divergence. This is deliberately NOT a
 * wall-clock age check - a finished tournament's last run is legitimately days old yet CURRENT, so age
 * would false-alarm on the correct final board.
 */
export function isForecastStale(
  renderedRunId: string | null | undefined,
  liveRunId: string | null | undefined,
): boolean {
  if (!renderedRunId || !liveRunId) return false;
  return renderedRunId !== liveRunId;
}
