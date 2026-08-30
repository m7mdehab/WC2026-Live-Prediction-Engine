// Phase 1.1 -- the heartbeat DECISION (pure, fully testable; no server-only, no I/O).
//
// A Supabase pg_cron job pings POST /api/cron/tick every few minutes (the RELIABLE trigger that
// replaces GitHub's throttled `schedule:`). The route reads the live fixture set + the last published
// run, then asks decideTick() whether to fire a recalc dispatch. Keeping the decision pure means the
// "when do we dispatch" policy is unit-tested with synthetic clocks -- no network, no DB, no real time.
//
// POLICY (every threshold documented + tested):
//   * WINDOW-AWARE: a match window is ACTIVE when some fixture is not yet completed and its kickoff
//     is within [now - WINDOW_AFTER_HOURS, now + WINDOW_LEAD_MIN]. During a window we want prompt
//     detection of a finish, so we tick aggressively (subject to MIN_GAP below).
//   * HOURLY FLOOR: regardless of windows, if the last published run is older than FLOOR_MINUTES
//     (or there is none), we dispatch -- nothing is ever missed for longer than ~an hour even when
//     no window is detected (defense in depth with the GitHub `schedule:` backup).
//   * MIN-GAP DAMPER: if a run published less than MIN_GAP_MINUTES ago we SKIP, so a fast pg_cron
//     cadence during a window cannot queue a storm of redundant recalcs (the pipeline is idempotent
//     and concurrency-queued, but a recent run already reflects reality -- no need to pile on).
//
// The dispatch itself is idempotent end to end: a double-tick cannot double-write, because the gated
// writer only writes a FINISHED-not-in-prod result and recalc publishes atomically.

export const WINDOW_AFTER_HOURS = 3; // a kickoff up to 3h ago is still an active window (match in play / just finished)
export const WINDOW_LEAD_MIN = 15; // ...and from 15 min before kickoff, so the heartbeat is already warm at the whistle
export const FLOOR_MINUTES = 55; // dispatch at least ~once/hour even with no detected window
export const MIN_GAP_MINUTES = 8; // do not re-dispatch within 8 min of the last published run

export interface TickFixture {
  kickoff_utc: string | null;
  /** fixtures.status -- "completed" means the result is in; anything else is still open. */
  status: string | null;
}

export interface TickInput {
  fixtures: TickFixture[];
  /** created_at of the most recently published run (current_run.created_at), or null if none. */
  lastRunAt: string | null;
  /** The server "now" captured ONCE by the route (deterministic; never a rendered clock). */
  now: string;
}

export interface TickDecision {
  dispatch: boolean;
  windowActive: boolean;
  floorDue: boolean;
  /** minutes since the last published run; null when there is no run yet. */
  minutesSinceRun: number | null;
  reason: string;
}

/** Minutes between two instants, or null if either is unparseable. */
function minutesBetween(fromIso: string | null, toMs: number): number | null {
  if (!fromIso) return null;
  const ms = Date.parse(fromIso);
  if (Number.isNaN(ms)) return null;
  return (toMs - ms) / 60_000;
}

/** Is any open fixture inside the live match window around `nowMs`? */
function hasActiveWindow(fixtures: TickFixture[], nowMs: number): boolean {
  const afterMs = WINDOW_AFTER_HOURS * 60 * 60 * 1000;
  const leadMs = WINDOW_LEAD_MIN * 60 * 1000;
  for (const f of fixtures) {
    if ((f.status ?? "") === "completed") continue; // already has a result -> not part of the live window
    if (!f.kickoff_utc) continue;
    const k = Date.parse(f.kickoff_utc);
    if (Number.isNaN(k)) continue;
    const delta = nowMs - k; // >0 after kickoff
    if (delta >= -leadMs && delta <= afterMs) return true;
  }
  return false;
}

/**
 * Decide whether this heartbeat tick should fire a recalc dispatch. Pure: same inputs -> same output.
 */
export function decideTick(input: TickInput): TickDecision {
  const nowMs = Date.parse(input.now);
  if (Number.isNaN(nowMs)) {
    // A bad clock must never silently suppress the pipeline: fail OPEN (dispatch) and say why.
    return {
      dispatch: true,
      windowActive: false,
      floorDue: true,
      minutesSinceRun: null,
      reason: "unparseable now -> failing open (dispatch)",
    };
  }

  const windowActive = hasActiveWindow(input.fixtures, nowMs);
  const sinceRun = minutesBetween(input.lastRunAt, nowMs);
  // No run yet, or an unparseable timestamp -> treat as long ago (floor due, no recent-run damper).
  const minutesSinceRun = sinceRun == null ? null : Math.round(sinceRun * 10) / 10;
  const effectiveSince = sinceRun == null ? Infinity : sinceRun;

  // OFF-SEASON PARK (Phase 5): once EVERY fixture is completed and a run already exists, the
  // tournament is over - nothing new can ever arrive, so the hourly floor would only republish an
  // identical run forever. Park the heartbeat (dispatch:false). Self-adjusting: a NEW tournament
  // re-seeds open fixtures and this reverts automatically; bootstrap (no run yet) is never parked;
  // an empty fixture set (a read blip) is NOT "complete" so the fail-open floor still applies.
  // workflow_dispatch stays fully functional for a manual recalc.
  const seasonOver =
    input.lastRunAt != null &&
    input.fixtures.length > 0 &&
    input.fixtures.every((f) => (f.status ?? "") === "completed");

  const floorDue = effectiveSince >= FLOOR_MINUTES;
  const recentRun = effectiveSince < MIN_GAP_MINUTES;
  const want = !seasonOver && (windowActive || floorDue);
  const dispatch = want && !recentRun;

  let reason: string;
  if (seasonOver) {
    reason = `parked: tournament complete (all ${input.fixtures.length} fixtures final) - heartbeat idle; workflow_dispatch still forces a recalc`;
  } else if (!want) {
    reason = `idle: no active window and last run ${fmtSince(minutesSinceRun)} ago (< floor ${FLOOR_MINUTES}m)`;
  } else if (recentRun) {
    reason = `skip: ${windowActive ? "window active" : "floor due"} but last run only ${fmtSince(minutesSinceRun)} ago (< gap ${MIN_GAP_MINUTES}m)`;
  } else if (windowActive) {
    reason = `dispatch: match window active (last run ${fmtSince(minutesSinceRun)} ago)`;
  } else {
    reason = `dispatch: hourly floor (last run ${fmtSince(minutesSinceRun)} ago >= ${FLOOR_MINUTES}m)`;
  }

  return { dispatch, windowActive, floorDue, minutesSinceRun, reason };
}

function fmtSince(m: number | null): string {
  return m == null ? "never" : `${m}m`;
}
