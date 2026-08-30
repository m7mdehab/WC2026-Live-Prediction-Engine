// Pure, season-aware health verdicts for /api/health and /api/health/freshness. Kept free of I/O so
// the "a finished tournament is healthy, not stalled" logic is unit-tested with synthetic inputs.
//
// The bug these fix: post-tournament the final run is permanent, so its age only grows, and the
// freshness monitor is parked to a daily cadence - so both the run-age check (>6h) and the monitor-age
// check (>150m) fire FOREVER, reporting ok:false / 503 on a site that is in its correct terminal state.
// A frozen season (isFrozen: a run published AND every fixture final) with a published run is healthy;
// only a REAL reality-gap (a monitor gap/disagreement count > 0) should still page. Live behaviour is
// unchanged: the age checks and the monitor's own ok verdict govern exactly as before.

export const RUN_STALE_HOURS = 6;
export const MONITOR_STALE_MIN = 150;

/** A monitor row's SUBSTANTIVE problem: a real prod-vs-source reality gap, independent of the monitor's
 *  own staleness (which is expected once the monitor is parked). */
function hasRealMonitorProblem(gaps: number | null, disagreements: number | null): boolean {
  return (gaps ?? 0) > 0 || (disagreements ?? 0) > 0;
}

export interface HealthInputs {
  hasRun: boolean;
  runAgeHours: number | null;
  frozen: boolean;
  monitorOk: boolean | null;
  monitorGaps: number | null;
  monitorDisagreements: number | null;
}

/** Main pipeline-health verdict. Frozen + published run -> healthy unless a real reality-gap exists;
 *  live -> the age check and the monitor's own ok verdict govern (unchanged from the original). */
export function healthVerdict(i: HealthInputs): { runStale: boolean; healthy: boolean } {
  const runStale = !i.frozen && (i.runAgeHours == null || i.runAgeHours > RUN_STALE_HOURS);
  const healthy =
    i.hasRun &&
    !runStale &&
    (i.frozen ? !hasRealMonitorProblem(i.monitorGaps, i.monitorDisagreements) : i.monitorOk !== false);
  return { runStale, healthy };
}

export interface FreshnessInputs {
  frozen: boolean;
  monitorOk: boolean;
  ageMinutes: number;
  gaps: number | null;
  disagreements: number | null;
}

/** Freshness-probe verdict. Frozen -> the monitor's own staleness is expected (not a stall); healthy
 *  unless a real reality-gap exists. Live -> the monitor's ok verdict and its age govern (unchanged). */
export function freshnessVerdict(i: FreshnessInputs): { stale: boolean; healthy: boolean } {
  const stale = !i.frozen && i.ageMinutes > MONITOR_STALE_MIN;
  const healthy = !stale && (i.frozen ? !hasRealMonitorProblem(i.gaps, i.disagreements) : i.monitorOk);
  return { stale, healthy };
}
