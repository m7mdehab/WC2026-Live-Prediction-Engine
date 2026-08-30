// Pure, client-safe staleness math for the /players last-good resilience note. No React, no Date
// captured at import (caller passes nowMs) so it is deterministic and unit-testable.
//
// /players is ISR (see app/players/page.tsx): Next serves the last successfully generated render and
// regenerates in the background; a failed regeneration (slow/erroring Supabase) is DISCARDED, so the
// served page keeps aging until a regeneration succeeds. The page stamps the moment it was generated;
// this helper turns (generatedAt, now) into "how old is the board you are looking at", so a genuinely
// stale board carries an honest note instead of silently pretending to be live.

export interface Staleness {
  ageSec: number;
  stale: boolean;
  /** short relative label, e.g. "4 minutes", "1 hour" (no "ago" - the caller phrases it). */
  relLabel: string;
}

/** Default age past which the served board is called stale. Comfortably above the 60s ISR window +
 *  one revalidation, so a normally-refreshing page never shows the note; only a stuck (slow-DB)
 *  window that keeps discarding regenerations ages past it. */
export const DEFAULT_STALE_AFTER_SEC = 180;

function relLabel(ageSec: number): string {
  const s = Math.max(0, Math.floor(ageSec));
  if (s < 90) return `${Math.max(1, Math.round(s / 60)) === 1 ? "1 minute" : `${Math.round(s / 60)} minutes`}`;
  const min = Math.round(s / 60);
  if (min < 60) return `${min} minutes`;
  const hr = Math.round(min / 60);
  return hr === 1 ? "1 hour" : `${hr} hours`;
}

/** Compute the age of a generated-at instant vs now. Bad/absent input degrades to not-stale (never
 *  cry stale on a parse failure). staleAfterSec <= 0 disables the note. */
export function computeStaleness(
  generatedAtMs: number | null | undefined,
  nowMs: number,
  staleAfterSec: number = DEFAULT_STALE_AFTER_SEC,
): Staleness {
  if (generatedAtMs == null || !Number.isFinite(generatedAtMs) || !Number.isFinite(nowMs)) {
    return { ageSec: 0, stale: false, relLabel: relLabel(0) };
  }
  const ageSec = Math.max(0, (nowMs - generatedAtMs) / 1000);
  const stale = staleAfterSec > 0 && ageSec >= staleAfterSec;
  return { ageSec, stale, relLabel: relLabel(ageSec) };
}
