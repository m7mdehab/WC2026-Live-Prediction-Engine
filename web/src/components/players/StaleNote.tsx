"use client";

import { useEffect, useState } from "react";
import { computeStaleness, DEFAULT_STALE_AFTER_SEC } from "@/lib/players/staleness";

/**
 * A subtle, honest "you are looking at a cached board" note for /players. The page is ISR: it serves
 * the last GOOD render and discards a failed regeneration, so during a slow-Supabase window the served
 * board keeps aging. This client note compares the server-stamped generation instant to the client's
 * clock and, only once the board is genuinely old, tells the reader the live update is delayed. It
 * renders nothing while the board is fresh (the overwhelmingly common case), so it adds no noise and,
 * because it starts hidden and only appears on a real delay, never fabricates a problem.
 *
 * Client-only by construction (needs the reader's current time); server render is unaffected, so the
 * ISR HTML is identical for everyone and cache-safe.
 */
export function StaleNote({
  generatedAt,
  staleAfterSec = DEFAULT_STALE_AFTER_SEC,
}: {
  /** ISO instant the served render was generated (stamped server-side). */
  generatedAt: string;
  staleAfterSec?: number;
}) {
  const genMs = Date.parse(generatedAt);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(genMs)) return;
    const tick = () => {
      const { stale, relLabel } = computeStaleness(genMs, Date.now(), staleAfterSec);
      setNote(stale ? `Showing the last published board from ${relLabel} ago - live updates are delayed.` : null);
    };
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [genMs, staleAfterSec]);

  if (!note) return null;
  return (
    <p role="status" className="mt-3 rounded-md border border-border bg-elevated px-3 py-2 text-xs text-secondary">
      {note}
    </p>
  );
}
