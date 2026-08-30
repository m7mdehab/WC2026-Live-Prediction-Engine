// events types - owned by the events/admin track. Domain types for the protected /admin
// manual-entry form and the §8 events wiring (scope_lock §8, §2.2 #22). Kept out of the
// shared lib/types.ts per the Wave-0 module-ownership convention.

import type { Stage } from "@/lib/types";

/** The §8 event vocabulary (mirrors db/schema_g.sql events.event_type). */
export type EventType =
  | "red_card"
  | "yellow_suspension"
  | "injury"
  | "extra_time"
  | "penalty_shootout"
  | "key_sub"
  | "manual_note"
  | "half_time";

/** Injury severity flag (db/schema_g.sql events.severity). */
export type InjurySeverity = "minor" | "major" | "out";

/** A fixture as presented in the admin match picker, joined with any result already on file
 *  (so the form can prefill and show whether the match was entered before). */
export interface AdminEntryMatch {
  match_id: string;
  match_no: number;
  stage: Stage;
  team_a: string | null;
  team_b: string | null;
  kickoff_utc: string | null;
  fixtureStatus: "scheduled" | "completed";
  /** the current match_results row, if one exists */
  result: {
    home_score: number;
    away_score: number;
    winner_team: string | null;
    status: string;
    ht_home_score: number | null;
    ht_away_score: number | null;
  } | null;
}

/** One event row the admin is submitting (subset of the events table columns; run_id is left
 *  NULL at entry - the recalc step stamps/consumes events when it builds the next run). */
export interface EventInput {
  event_type: EventType;
  team: string | null;
  minute: number | null;
  player: string | null;
  severity: InjurySeverity | null;
  flag: boolean | null;
  note: string | null;
}

/** The payload POSTed to /api/admin. */
export interface AdminSubmission {
  match_id: string;
  /** final score */
  home_score: number;
  away_score: number;
  /** required for knockouts when marking complete (ET/penalties mean the score alone may not
   *  name who advanced - mirrors db/enter_result.py). */
  winner_team: string | null;
  /** true → status 'completed' + fixture completed; false → status 'half_time' (§2.2 #22). */
  mark_complete: boolean;
  /** optional half-time score → match_results.ht_home_score / ht_away_score. */
  ht_home_score: number | null;
  ht_away_score: number | null;
  /** §8 events (cards, injuries, extra time, penalties, key sub, manual note). */
  events: EventInput[];
}

/** Outcome of the automatic recalc trigger (GitHub repository_dispatch) fired after a result is
 *  marked complete. The result save NEVER fails because of this - a failed dispatch is reported
 *  truthfully so the operator can run the CLI fallback (`python -m db.recalc`). */
export interface RecalcDispatch {
  /** true when GitHub accepted the repository_dispatch (HTTP 204). */
  triggered: boolean;
  /** Operator-safe failure reason when triggered=false (never contains the token). */
  reason: string | null;
}

/** The current published prediction run, as read by the admin status poll (GET /api/admin). */
export interface CurrentRunSummary {
  run_id: string;
  created_at: string;
  conditioned_on_results: number;
}

/** What /api/admin returns on a successful (or simulated) write. */
export interface AdminSubmitResult {
  ok: true;
  match_id: string;
  status: string;
  events_written: number;
  /** true when the dev-only local preview short-circuited the write (no Supabase service key). */
  simulated: boolean;
  /** Recalc auto-trigger outcome; null when no dispatch applies (half-time / non-completing saves). */
  recalc: RecalcDispatch | null;
}

// ---------------------------------------------------------------------------------------------
// Player-stat manual override (Phase 4) - the GUARANTEED, always-correct path. A row written here
// is source='manual', locked=true and is NEVER clobbered by the best-effort FotMob ingester
// (db/ingest_player_stats.py enforces the same precedence).
// ---------------------------------------------------------------------------------------------

/** A tracked player as offered in the admin player picker. */
export interface AdminPlayer {
  id: string;
  name: string;
  nation: string;
  team: string | null;
  role: string | null;
}

/** The manual per-match player stat line the admin submits. Numeric fields are nullable so an
 *  admin can record only what they know; the ingester's auto value (if any) is overwritten
 *  wholesale by this manual row. */
export interface PlayerStatSubmission {
  player_id: string;
  match_id: string;
  minutes: number | null;
  goals: number | null;
  assists: number | null;
  shots: number | null;
  xg: number | null;
  xa: number | null;
  passes: number | null;
  pass_completion: number | null;
  key_passes: number | null;
  progressive_passes: number | null;
  duels_won: number | null;
  saves: number | null;
  goals_conceded: number | null;
  clean_sheet: boolean | null;
  yellow: number | null;
  red: number | null;
}

/** What /api/admin/player-stats returns on a successful (or simulated) write. */
export interface PlayerStatResult {
  ok: true;
  player_id: string;
  match_id: string;
  /** always 'manual' for this path (the system of record). */
  source: "manual";
  locked: true;
  simulated: boolean;
}

/** Access-gate states for the /admin route. `preview` is a dev-only, non-production escape hatch
 *  used solely to render the form for screenshots; it can never occur in a production build. */
export type AdminGate =
  | { state: "ok"; email: string }
  | { state: "forbidden"; email: string }
  | { state: "unauthenticated"; email: null }
  | { state: "preview"; email: string };
