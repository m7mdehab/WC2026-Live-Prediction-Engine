// events/admin data layer - owned by the events/admin track. Server-only reads + writes for the
// protected /admin manual-entry form (scope_lock §2.1 #16, §8, §2.2 #22). Per the Wave-0
// convention the shared lib/data.ts is edited only by live-ops; admin reads/writes live here.
import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createServiceSupabase, hasServiceRole } from "@/lib/supabase/service";
import type {
  AdminEntryMatch,
  AdminGate,
  AdminPlayer,
  AdminSubmission,
  AdminSubmitResult,
  CurrentRunSummary,
  EventInput,
  PlayerStatResult,
  PlayerStatSubmission,
  RecalcDispatch,
} from "@/lib/types/events";
import type { Fixture, Stage } from "@/lib/types";

/** CLI fallback when the automatic recalc dispatch fails (kept verbatim in operator copy). */
export const RECALC_CLI_FALLBACK = "python -m db.recalc";

// ---------------------------------------------------------------------------------------------
// Automatic recalc trigger (GitHub repository_dispatch → .github/workflows/recalc.yml)
// ---------------------------------------------------------------------------------------------

// PUBLISHED-EXTRACT DIVERGENCE, and the only one in this repository's source. Upstream this line is
// a hardcoded repository path. Here it is read from the environment, for two reasons:
//
//   THE HARDCODED PATH WAS WRONG BY THE TIME THIS WAS EXTRACTED. The repository it named was renamed,
//   and the old path was later reclaimed by a different, empty repository. A rename redirect stops
//   redirecting the moment somebody takes the old name, so the constant silently began pointing at
//   the wrong repository. A dispatch to a repository with no workflows is accepted and runs nothing,
//   which is a failure that reports success.
//
//   AND A PUBLISHED FILE SHOULD NOT NAME A PRIVATE REPOSITORY. The pipeline this fires lives in a
//   repository that is not published, so hardcoding its path here would be both a dead reference and
//   a disclosure.
//
// Unset, dispatchRecalc returns { triggered: false } with a reason, which is the same path it already
// takes when the token is missing. It never throws and it never silently no-ops.
const DISPATCH_REPO = process.env.GITHUB_RECALC_REPO;
const DISPATCH_URL = DISPATCH_REPO
  ? `https://api.github.com/repos/${DISPATCH_REPO}/dispatches`
  : null;
const DISPATCH_TIMEOUT_MS = 5_000;

/** Fire the recalc workflow for a just-completed match via GitHub repository_dispatch.
 *
 *  Guarantees:
 *  - NEVER throws - every failure (missing token, network, non-204, timeout) resolves to
 *    `{ triggered: false, reason }` so the result save can never fail because of the dispatch.
 *  - The token is read ONLY from process.env.GITHUB_RECALC_TOKEN - no fallback value of any
 *    kind - and is never logged or echoed into the reason string.
 *  - Bounded by a short timeout so the admin response stays fast. */
export async function dispatchRecalc(matchId: string): Promise<RecalcDispatch> {
  const token = process.env.GITHUB_RECALC_TOKEN;
  if (!token) {
    return {
      triggered: false,
      reason: "GITHUB_RECALC_TOKEN is not configured in this environment",
    };
  }
  if (!DISPATCH_URL) {
    return {
      triggered: false,
      reason: "GITHUB_RECALC_REPO is not configured in this environment",
    };
  }
  try {
    const res = await fetch(DISPATCH_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ event_type: "recalc", client_payload: { match_id: matchId } }),
      cache: "no-store",
      signal: AbortSignal.timeout(DISPATCH_TIMEOUT_MS),
    });
    if (res.status === 204) return { triggered: true, reason: null };
    // 401/403 = bad or under-scoped token; 404 = repo invisible to the token. Status only -
    // never echo response bodies or headers (and never the token) into operator copy.
    return { triggered: false, reason: `GitHub responded ${res.status}` };
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    return {
      triggered: false,
      reason: timedOut
        ? `GitHub did not respond within ${DISPATCH_TIMEOUT_MS / 1000}s`
        : "network error reaching GitHub",
    };
  }
}

/** The current published run (current_run view) - the admin status poll reads this to confirm a
 *  triggered recalc actually published. Anon-key read; null when no run is published. */
export async function getCurrentRunSummary(): Promise<CurrentRunSummary | null> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("current_run")
    .select("run_id, created_at, conditioned_on_results")
    .limit(1);
  if (error) throw error;
  return (data?.[0] as CurrentRunSummary | undefined) ?? null;
}

/** Dev-only, non-production escape hatch to render the form for screenshots without a live
 *  Supabase auth session. Requires BOTH a non-production build AND an explicit env flag, so it
 *  can never be reached in the deployed (production) build. */
function isLocalPreview(): boolean {
  return process.env.NODE_ENV !== "production" && process.env.ADMIN_LOCAL_PREVIEW === "1";
}

// ---------------------------------------------------------------------------------------------
// Access gate
// ---------------------------------------------------------------------------------------------

/** Resolve the /admin access state: unauthenticated (blocked) → forbidden (signed in, not on the
 *  allowlist) → ok (signed in + is_admin()). Reads the Supabase Auth session from cookies and
 *  consults the SECURITY DEFINER is_admin() RPC (db/schema.sql) under the caller's own JWT. */
export async function getAdminGate(): Promise<AdminGate> {
  if (isLocalPreview()) return { state: "preview", email: "preview@local" };

  let sb;
  try {
    sb = await createClient();
  } catch {
    // env not configured → treat as blocked (the gate must fail closed)
    return { state: "unauthenticated", email: null };
  }

  let email: string | null = null;
  try {
    const { data, error } = await sb.auth.getUser();
    if (error) return { state: "unauthenticated", email: null };
    email = data.user?.email ?? null;
  } catch {
    return { state: "unauthenticated", email: null };
  }
  if (!email) return { state: "unauthenticated", email: null };

  // is_admin() is SECURITY DEFINER (consults admin_allowlist without granting read access to it).
  try {
    const { data: ok, error } = await sb.rpc("is_admin");
    if (error || !ok) return { state: "forbidden", email };
  } catch {
    return { state: "forbidden", email };
  }
  return { state: "ok", email };
}

// ---------------------------------------------------------------------------------------------
// Match picker data
// ---------------------------------------------------------------------------------------------

/** A tiny, clearly-fake fixture set used ONLY in dev local-preview when no Supabase is wired,
 *  so the form (and its stage-dependent winner field) renders for screenshots. */
const PREVIEW_MATCHES: AdminEntryMatch[] = [
  {
    match_id: "M001", match_no: 1, stage: "group", team_a: "Mexico", team_b: "Poland",
    kickoff_utc: "2026-06-11T19:00:00Z", fixtureStatus: "scheduled", result: null,
  },
  {
    match_id: "M002", match_no: 2, stage: "group", team_a: "Canada", team_b: "Morocco",
    kickoff_utc: "2026-06-11T22:00:00Z", fixtureStatus: "scheduled", result: null,
  },
  {
    match_id: "M073", match_no: 73, stage: "round_of_32", team_a: "Spain", team_b: "Croatia",
    kickoff_utc: "2026-06-28T19:00:00Z", fixtureStatus: "scheduled", result: null,
  },
];

interface ResultRow {
  match_id: string;
  home_score: number;
  away_score: number;
  winner_team: string | null;
  status: string;
  ht_home_score: number | null;
  ht_away_score: number | null;
}

/** All fixtures (ordered by match_no) joined with any existing match_results row, for the picker. */
export async function getEntryMatches(): Promise<AdminEntryMatch[]> {
  let sb;
  try {
    sb = await createClient();
  } catch (err) {
    if (isLocalPreview()) return PREVIEW_MATCHES;
    throw err;
  }

  try {
    const [fx, res] = await Promise.all([
      // scaling-guard-ok: fixtures is bounded by the tournament (<=104 rows, the full match calendar)
      sb.from("fixtures").select("match_id, match_no, stage, team_a, team_b, kickoff_utc, status").order("match_no"),
      // scaling-guard-ok: match_results is bounded by the tournament (<=104 rows, one per match)
      sb.from("match_results").select("match_id, home_score, away_score, winner_team, status, ht_home_score, ht_away_score"),
    ]);
    if (fx.error) throw fx.error;
    if (res.error) throw res.error;

    const results = new Map<string, ResultRow>(
      ((res.data ?? []) as ResultRow[]).map((r) => [r.match_id, r])
    );
    return ((fx.data ?? []) as Fixture[]).map((f) => {
      const r = results.get(f.match_id);
      return {
        match_id: f.match_id,
        match_no: f.match_no,
        stage: f.stage,
        team_a: f.team_a,
        team_b: f.team_b,
        kickoff_utc: f.kickoff_utc,
        fixtureStatus: f.status,
        result: r
          ? {
              home_score: r.home_score, away_score: r.away_score, winner_team: r.winner_team,
              status: r.status, ht_home_score: r.ht_home_score, ht_away_score: r.ht_away_score,
            }
          : null,
      };
    });
  } catch (err) {
    if (isLocalPreview()) return PREVIEW_MATCHES;
    throw err;
  }
}

// ---------------------------------------------------------------------------------------------
// Write path (called by /api/admin AFTER the request is authorized)
// ---------------------------------------------------------------------------------------------

const EVENT_TYPES = new Set<EventInput["event_type"]>([
  "red_card", "yellow_suspension", "injury", "extra_time",
  "penalty_shootout", "key_sub", "manual_note", "half_time",
]);

export class AdminEntryError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/** Coerce + validate the raw request body into an AdminSubmission. Throws AdminEntryError(400). */
export function parseSubmission(body: unknown): AdminSubmission {
  const b = (body ?? {}) as Record<string, unknown>;
  const match_id = typeof b.match_id === "string" ? b.match_id.trim() : "";
  if (!match_id) throw new AdminEntryError("match_id is required");

  const home_score = toInt(b.home_score, "home_score");
  const away_score = toInt(b.away_score, "away_score");
  if (home_score < 0 || away_score < 0) throw new AdminEntryError("scores must be ≥ 0");

  const mark_complete = b.mark_complete === true;
  const winner_team = typeof b.winner_team === "string" && b.winner_team.trim() ? b.winner_team.trim() : null;

  const ht_home_score = b.ht_home_score == null || b.ht_home_score === "" ? null : toInt(b.ht_home_score, "ht_home_score");
  const ht_away_score = b.ht_away_score == null || b.ht_away_score === "" ? null : toInt(b.ht_away_score, "ht_away_score");
  if ((ht_home_score == null) !== (ht_away_score == null)) {
    throw new AdminEntryError("half-time score needs both home and away values");
  }

  const rawEvents = Array.isArray(b.events) ? b.events : [];
  const events: EventInput[] = rawEvents.map((e, i) => parseEvent(e, i));

  return { match_id, home_score, away_score, winner_team, mark_complete, ht_home_score, ht_away_score, events };
}

function parseEvent(raw: unknown, i: number): EventInput {
  const e = (raw ?? {}) as Record<string, unknown>;
  const event_type = e.event_type as EventInput["event_type"];
  if (!EVENT_TYPES.has(event_type)) throw new AdminEntryError(`event ${i + 1}: unknown event_type ${String(e.event_type)}`);
  const minute = e.minute == null || e.minute === "" ? null : toInt(e.minute, `event ${i + 1} minute`);
  const severity = e.severity === "minor" || e.severity === "major" || e.severity === "out" ? e.severity : null;
  return {
    event_type,
    team: str(e.team),
    minute,
    player: str(e.player),
    severity,
    flag: typeof e.flag === "boolean" ? e.flag : null,
    note: str(e.note),
  };
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function toInt(v: unknown, field: string): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isInteger(n)) throw new AdminEntryError(`${field} must be a whole number`);
  return n;
}

/** Apply the stage-dependent winner rule (mirrors db/enter_result.py): group results don't carry
 *  a winner; a completed knockout requires one (ET/penalties mean the score alone may not name who
 *  advanced). Returns the winner_team to persist, or throws AdminEntryError(400). */
function resolveWinner(stage: Stage, sub: AdminSubmission): string | null {
  if (!sub.mark_complete) return sub.winner_team;
  if (stage === "group") return null;
  if (!sub.winner_team) {
    throw new AdminEntryError(
      `${sub.match_id} is a knockout (${stage}); a winner is required (ET/penalties mean the score alone may not name who advanced).`
    );
  }
  return sub.winner_team;
}

/** Perform the write: upsert match_results (+ half-time + completion), insert events rows, and an
 *  admin_audit_log row - all via the service client (events grants INSERT to service_role only).
 *  The caller MUST have already authorized the request (session + is_admin). `actorEmail` is
 *  recorded as entered_by / actor_email. Recalc is NOT triggered here - the /api/admin route
 *  fires dispatchRecalc() after a successful completing write (and only then). */
export async function submitAdminEntry(sub: AdminSubmission, actorEmail: string): Promise<AdminSubmitResult> {
  // dev local-preview without a service key → simulate (no DB), so the success state is
  // screenshot-able. Still applies the same knockout-winner validation as production (stage from
  // the preview fixture set) so the simulated path faithfully mirrors the real one.
  if (isLocalPreview() && !hasServiceRole()) {
    const pm = PREVIEW_MATCHES.find((m) => m.match_id === sub.match_id);
    if (pm) resolveWinner(pm.stage, sub);
    return {
      ok: true, match_id: sub.match_id, status: sub.mark_complete ? "completed" : "half_time",
      events_written: sub.events.length, simulated: true, recalc: null,
    };
  }

  const svc = createServiceSupabase();

  // Resolve stage + validate the knockout-winner rule (mirrors db/enter_result.py).
  const fx = await svc.from("fixtures").select("match_id, stage, team_a, team_b").eq("match_id", sub.match_id).limit(1);
  if (fx.error) throw new AdminEntryError(fx.error.message, 500);
  const fixture = (fx.data?.[0] as Pick<Fixture, "match_id" | "stage" | "team_a" | "team_b"> | undefined);
  if (!fixture) throw new AdminEntryError(`unknown match_id ${sub.match_id}`, 404);

  const stage: Stage = fixture.stage;
  const winner_team = resolveWinner(stage, sub);

  const status = sub.mark_complete ? "completed" : "half_time";
  const enteredAt = new Date().toISOString();

  const resultRow = {
    match_id: sub.match_id,
    home_score: sub.home_score,
    away_score: sub.away_score,
    winner_team,
    status,
    ht_home_score: sub.ht_home_score,
    ht_away_score: sub.ht_away_score,
    entered_at: enteredAt,
    entered_by: actorEmail,
  };
  const up = await svc.from("match_results").upsert(resultRow, { onConflict: "match_id" });
  if (up.error) throw new AdminEntryError(up.error.message, 500);

  // completing a match marks the fixture completed too (half-time entries leave it scheduled)
  if (sub.mark_complete) {
    const fu = await svc.from("fixtures").update({ status: "completed" }).eq("match_id", sub.match_id);
    if (fu.error) throw new AdminEntryError(fu.error.message, 500);
  }

  // events rows: run_id NULL at entry - recalc stamps/consumes them when it builds the next run.
  let events_written = 0;
  if (sub.events.length) {
    const rows = sub.events.map((e) => ({
      match_id: sub.match_id,
      run_id: null as string | null,
      team: e.team,
      event_type: e.event_type,
      minute: e.minute,
      player: e.player,
      severity: e.severity,
      flag: e.flag,
      note: e.note,
    }));
    const ev = await svc.from("events").insert(rows);
    if (ev.error) throw new AdminEntryError(ev.error.message, 500);
    events_written = rows.length;
  }

  // audit trail (same shape as db/enter_result.py's admin_audit_log insert)
  await svc.from("admin_audit_log").insert({
    actor_email: actorEmail,
    action: sub.mark_complete ? "enter_result" : "enter_half_time",
    detail: {
      match_id: sub.match_id, home_score: sub.home_score, away_score: sub.away_score,
      winner_team, stage, status,
      ht: sub.ht_home_score == null ? null : { home: sub.ht_home_score, away: sub.ht_away_score },
      events: sub.events.map((e) => e.event_type),
    },
  });

  return { ok: true, match_id: sub.match_id, status, events_written, simulated: false, recalc: null };
}

// ---------------------------------------------------------------------------------------------
// Player-stat MANUAL OVERRIDE (Phase 4) - the always-correct system of record.
//
// A row written here is source='manual', locked=true. The best-effort FotMob ingester
// (db/ingest_player_stats.py) reads source/locked FIRST and NEVER overwrites a manual/locked row,
// so a value entered here is sacrosanct. Mirrors the score-entry write: service role (after the
// request is authorized), audit-logged, and the route revalidates the player surfaces on success.
// ---------------------------------------------------------------------------------------------

/** A small, clearly-fake player set used ONLY in dev local-preview when no Supabase is wired. */
const PREVIEW_PLAYERS: AdminPlayer[] = [
  { id: "mexico-raul-jimenez", name: "Raúl Jiménez", nation: "Mexico", team: "Mexico", role: "FW" },
  { id: "spain-lamine-yamal", name: "Lamine Yamal", nation: "Spain", team: "Spain", role: "FW" },
  { id: "argentina-lionel-messi", name: "Lionel Messi", nation: "Argentina", team: "Argentina", role: "FW" },
];

/** Tracked players for the admin player picker (ordered nation, then name). Anon-readable table,
 *  but read with the service client here so the picker works even before public RLS is exercised. */
export async function getAdminPlayers(): Promise<AdminPlayer[]> {
  if (isLocalPreview() && !hasServiceRole()) return PREVIEW_PLAYERS;
  const svc = createServiceSupabase();
  const { data, error } = await svc
    .from("players")
    .select("id, name, nation, team, role")
    .eq("tracked", true)
    .order("nation")
    .order("name");
  if (error) throw new AdminEntryError(error.message, 500);
  return (data ?? []) as AdminPlayer[];
}

/** Numeric player-stat columns (must match player_match_stats; mirrors the ingester's _STAT_COLS). */
const PLAYER_STAT_NUM_FIELDS = [
  "minutes", "goals", "assists", "shots", "xg", "xa", "passes", "pass_completion",
  "key_passes", "progressive_passes", "duels_won", "saves", "goals_conceded", "yellow", "red",
] as const;

function toNumOrNull(v: unknown, field: string): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (Number.isNaN(n)) throw new AdminEntryError(`${field} must be a number`);
  if (n < 0) throw new AdminEntryError(`${field} must be ≥ 0`);
  return n;
}

/** Coerce + validate the raw body into a PlayerStatSubmission. Throws AdminEntryError(400). */
export function parsePlayerStatSubmission(body: unknown): PlayerStatSubmission {
  const b = (body ?? {}) as Record<string, unknown>;
  const player_id = typeof b.player_id === "string" ? b.player_id.trim() : "";
  const match_id = typeof b.match_id === "string" ? b.match_id.trim() : "";
  if (!player_id) throw new AdminEntryError("player_id is required");
  if (!match_id) throw new AdminEntryError("match_id is required");

  const out: Record<string, unknown> = { player_id, match_id };
  for (const f of PLAYER_STAT_NUM_FIELDS) out[f] = toNumOrNull(b[f], f);
  out.clean_sheet = b.clean_sheet == null || b.clean_sheet === "" ? null : b.clean_sheet === true || b.clean_sheet === "true";
  return out as unknown as PlayerStatSubmission;
}

/** Write a MANUAL player-stat row (source='manual', locked=true) via the service role. The caller
 *  MUST have authorized the request. Validates the player + match exist; records an audit row. */
export async function submitPlayerStat(
  sub: PlayerStatSubmission,
  actorEmail: string
): Promise<PlayerStatResult> {
  // dev local-preview without a service key → simulate (no DB), so the success state is screenshot-able.
  if (isLocalPreview() && !hasServiceRole()) {
    return {
      ok: true, player_id: sub.player_id, match_id: sub.match_id,
      source: "manual", locked: true, simulated: true,
    };
  }

  const svc = createServiceSupabase();

  // Validate FKs so we never write a dangling manual row.
  const [pl, fx] = await Promise.all([
    svc.from("players").select("id").eq("id", sub.player_id).limit(1),
    svc.from("fixtures").select("match_id").eq("match_id", sub.match_id).limit(1),
  ]);
  if (pl.error) throw new AdminEntryError(pl.error.message, 500);
  if (fx.error) throw new AdminEntryError(fx.error.message, 500);
  if (!pl.data?.length) throw new AdminEntryError(`unknown player_id ${sub.player_id}`, 404);
  if (!fx.data?.length) throw new AdminEntryError(`unknown match_id ${sub.match_id}`, 404);

  const row = {
    ...sub,
    source: "manual" as const,
    locked: true,
    entered_at: new Date().toISOString(),
  };
  const up = await svc
    .from("player_match_stats")
    .upsert(row, { onConflict: "player_id,match_id" });
  if (up.error) throw new AdminEntryError(up.error.message, 500);

  await svc.from("admin_audit_log").insert({
    actor_email: actorEmail,
    action: "enter_player_stat",
    detail: {
      player_id: sub.player_id, match_id: sub.match_id,
      goals: sub.goals, assists: sub.assists, minutes: sub.minutes,
      source: "manual", locked: true,
    },
  });

  return { ok: true, player_id: sub.player_id, match_id: sub.match_id, source: "manual", locked: true, simulated: false };
}
