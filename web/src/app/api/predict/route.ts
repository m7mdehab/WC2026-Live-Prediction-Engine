import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { isSeasonFrozen } from "@/lib/data/freeze";
import { getGroupMembership, getCurrentRunId, getSeedingInputs } from "@/lib/data/brackets";
import {
  ALL_KO_IDS,
  FINAL_ID,
  GROUP_CODES,
  buildFieldSnapshot,
  matchParticipants,
} from "@/lib/types/brackets";
import type { BracketPayload, BracketSubmission, GroupStanding, SubmitResponse } from "@/lib/types/brackets";

// Public bracket submissions (schema_version 3 - full bracket with ranked group standings). anon-key insert is allowed by the
// shape-validated RLS policy (db/schema.sql: p_bracket_insert), which only checks jsonb_typeof =
// object; we re-validate EVERYTHING here against canonical team + projection data and re-derive the
// R32 field_snapshot server-side (the client's picks are trusted only as picks, never as the field).
// No SELECT policy exists on the table, so we never read the row back over the anon key (verification
// uses the service role out-of-band). See docs/bracket_submission_contract.md for the 8 rules.
export const dynamic = "force-dynamic";

const MAX = { name: 80, email: 254, linkedin: 200 } as const;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** SHA-256 of a salted client IP - coarse rate/abuse signal, never the raw IP. No in-source salt
 *  default: the POST guard already rejects a missing IP_HASH_SALT, and this fails loud too so no
 *  refactor (or alternate caller) can ever resurrect a weak, predictable-salt hash. */
function clientIpHash(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim() || req.headers.get("x-real-ip")?.trim() || "";
  if (!ip) return null;
  const salt = process.env.IP_HASH_SALT;
  if (!salt) throw new Error("IP_HASH_SALT not configured");
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

function bad(error: string, fields?: Record<string, string>) {
  return NextResponse.json<SubmitResponse>({ ok: false, error, fields }, { status: 400 });
}

export async function POST(req: Request): Promise<NextResponse> {
  // Fail loud on a missing salt rather than degrading to the in-source default in clientIpHash()
  // (which would persist weak, predictable-salt hashes). Misconfiguration must not write rows.
  if (!process.env.IP_HASH_SALT) throw new Error("IP_HASH_SALT not configured");

  // ---- Rule 0: the challenge is CLOSED once the season is frozen (a run has published AND every
  // fixture is completed - the tournament is over). No new entry may join the AI-vs-humans board after
  // the Final, when the champion is already known. This uses the isFrozen DATA predicate (the SAME one
  // decideTick and the static seal use), never a hardcoded date, so a future live season REOPENS the
  // door automatically the moment it seeds open fixtures. Fail-soft by construction: isSeasonFrozen
  // returns false on any probe blip, so a transient error can only ever leave the door OPEN (never
  // wrongly block a legitimate live entry); the scoring-side timestamp exclusion (lib/data/humans.ts,
  // eligibleForScoring) is the defence-in-depth that keeps any row slipping past this door off the board.
  if (await isSeasonFrozen()) {
    return NextResponse.json<SubmitResponse>(
      {
        ok: false,
        error:
          "The bracket challenge is closed. The tournament has finished, so new entries can no longer be submitted.",
      },
      { status: 403 }
    );
  }

  let body: BracketSubmission;
  try {
    body = (await req.json()) as BracketSubmission;
  } catch {
    return bad("Could not read your submission. Please try again.");
  }

  const fields: Record<string, string> = {};

  // ---- Rule 2: display name ----
  const name = (body.display_name ?? "").trim();
  if (!name) fields.display_name = "Please add a display name.";
  else if (name.length > MAX.name) fields.display_name = `Keep it under ${MAX.name} characters.`;

  // ---- optional contact (Rule 8's "optional fields validated if present") ----
  const email = (body.email ?? "").trim();
  if (email && (email.length > MAX.email || !EMAIL_RE.test(email))) {
    fields.email = "Enter a valid email address, or leave it blank.";
  }

  const linkedin = (body.linkedin_url ?? "").trim();
  if (linkedin) {
    let host = "";
    try {
      host = new URL(linkedin).hostname.toLowerCase();
    } catch {
      /* not a URL */
    }
    if (linkedin.length > MAX.linkedin || !/(^|\.)linkedin\.com$/.test(host)) {
      fields.linkedin_url = "Enter a full LinkedIn URL, or leave it blank.";
    }
  }

  const champion = (body.champion_pick ?? "").trim();
  const standings = body.group_standings ?? {};
  const picks = body.knockout_picks ?? {};

  // Canonical team/group data + current run + its seeding inputs - the source of truth.
  let membership;
  let runId: string | null;
  try {
    [membership, runId] = await Promise.all([getGroupMembership(), getCurrentRunId()]);
  } catch (err) {
    console.error("predict: canonical data load failed:", err);
    return NextResponse.json<SubmitResponse>(
      { ok: false, error: "Could not load teams right now. Please try again shortly." },
      { status: 503 }
    );
  }

  // ---- Rule 5: source_run_id must be a non-null run ----
  if (!runId) {
    return NextResponse.json<SubmitResponse>(
      { ok: false, error: "No published model projection is available right now. Please try again shortly." },
      { status: 503 }
    );
  }

  // ---- Rule 3 (v3): each group ranks three distinct, valid members (1st / 2nd / 3rd) ----
  // group_winners is derived from this (= each group's 1st) - never trusted from the client.
  const normalizedStandings: Record<string, GroupStanding> = {};
  const normalizedWinners: Record<string, string> = {};
  for (const g of GROUP_CODES) {
    const s = standings[g];
    const valid = membership.byGroup[g] ?? [];
    const first = (s?.first ?? "").trim();
    const second = (s?.second ?? "").trim();
    const third = (s?.third ?? "").trim();
    if (!first || !second || !third) {
      fields[`group_${g}`] = `Rank 1st, 2nd and 3rd for Group ${g}.`;
    } else if (![first, second, third].every((t) => valid.includes(t))) {
      fields[`group_${g}`] = `Those teams aren't all in Group ${g}.`;
    } else if (first === second || first === third || second === third) {
      fields[`group_${g}`] = `Rank three different teams for Group ${g}.`;
    } else {
      normalizedStandings[g] = { first, second, third };
      normalizedWinners[g] = first;
    }
  }

  if (Object.keys(fields).length > 0) {
    return bad("Please fix the highlighted fields.", fields);
  }

  // ---- §2.4: re-derive the R32 field from canonical seeding (never trust the client's field) ----
  let seeding;
  try {
    seeding = await getSeedingInputs(runId);
  } catch (err) {
    console.error("predict: seeding inputs load failed:", err);
    seeding = null;
  }
  if (!seeding) {
    return NextResponse.json<SubmitResponse>(
      { ok: false, error: "The model projection needed to score brackets is unavailable right now. Please try again shortly." },
      { status: 503 }
    );
  }

  const fieldSnapshot = buildFieldSnapshot(normalizedStandings, seeding, runId);
  // ---- Rule 4: exactly 32 distinct, valid R32 occupants; 1X == group_winners[X] ----
  // §2.4 guarantees this for any valid winner set, so a failure is a reconstruction bug, not a
  // bad submission - surface it as a server error rather than reject the user.
  if (!fieldSnapshot) {
    console.error("predict: field reconstruction failed (run %s)", runId);
    return NextResponse.json<SubmitResponse>(
      { ok: false, error: "Something went wrong seeding the bracket. Please try again." },
      { status: 500 }
    );
  }
  const r32Slots = fieldSnapshot.r32_slots;
  const slotValues = Object.values(r32Slots);
  if (slotValues.length !== 32 || new Set(slotValues).size !== 32) {
    console.error("predict: r32 field not 32-distinct (run %s)", runId);
    return NextResponse.json<SubmitResponse>(
      { ok: false, error: "Something went wrong seeding the bracket. Please try again." },
      { status: 500 }
    );
  }

  // ---- Rule 6: exactly the 31 knockout ids, no extras, no M103 ----
  // Check unknowns (extras, incl. the excluded third-place M103) before missing, so each failure
  // gets a distinct, reachable message rather than collapsing to a length mismatch.
  const expected = new Set(ALL_KO_IDS);
  const unknownIds = Object.keys(picks).filter((id) => !expected.has(id));
  if (unknownIds.length > 0) {
    return bad(`Your knockout picks include a match that isn't part of the bracket (${unknownIds[0]}). Please re-enter and submit again.`);
  }
  if (!ALL_KO_IDS.every((id) => picks[id])) {
    return bad("Your knockout picks are incomplete. Tap a winner for every tie through to the Final.");
  }

  // ---- Rule 7: round-feeds-round - every winner is one of its two resolved participants ----
  // Walking in round order, each match's participants come from r32_slots (R32) or the prior
  // round's already-validated picks (R16→Final). A pick outside {a, b} breaks the chain.
  for (const id of ALL_KO_IDS) {
    const [a, b] = matchParticipants(id, r32Slots, picks);
    const w = picks[id];
    if (w !== a && w !== b) {
      return bad("Your knockout picks don't line up round to round. Please re-pick from the affected tie.");
    }
  }

  // ---- Rule 8: champion consistency - champion_pick == Final pick ----
  if (!champion) return bad("Pick a champion by advancing a team through the Final.");
  if (champion !== picks[FINAL_ID]) {
    return bad("Your champion must be the team you advanced through the Final.");
  }

  const bracket: BracketPayload = {
    schema_version: 3,
    display_name: name,
    prediction_run_id: runId,
    group_standings: normalizedStandings,
    group_winners: normalizedWinners,
    knockout_picks: picks,
    field_snapshot: fieldSnapshot,
  };

  const sb = await createClient();
  const { error } = await sb.from("bracket_submissions").insert({
    champion_pick: champion,
    bracket,
    email: email || null,
    // Consent is only meaningful alongside an email; never store a dangling true.
    consent_to_updates: Boolean(body.consent_to_updates) && Boolean(email),
    linkedin_url: linkedin || null,
    ip_hash: clientIpHash(req),
  });

  if (error) {
    // Duplicate display name → the unique index ux_bracket_display_name (db/schema_h.sql) raises
    // unique_violation (SQLSTATE 23505). Surface it as a friendly inline error on the name field,
    // not a 500, so the entry survives and the user just re-names. Case-insensitive + trimmed (the
    // index normalizes via lower(btrim(...))).
    if (error.code === "23505" || /duplicate key|ux_bracket_display_name/i.test(error.message)) {
      const dup = "That name's already taken. Add a number or use a handle (like yourname7).";
      return bad(dup, { display_name: dup });
    }
    console.error("predict: insert failed:", error);
    return NextResponse.json<SubmitResponse>(
      { ok: false, error: "Something went wrong saving your bracket. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json<SubmitResponse>({ ok: true });
}
