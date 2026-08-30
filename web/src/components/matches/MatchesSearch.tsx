"use client";

// The client island for the /matches fixture search. MatchSections is a render-only component (no
// async, no server-only deps), so this island can hold the query state, filter the fixtures by
// team, and render the (filtered) sections directly. The page passes the full fixture set + the
// single server `nowISO` down; the EMPTY-query render is byte-identical to rendering MatchSections
// with the unfiltered set, so SSR determinism for the no-query state is preserved.

import { useMemo, useState } from "react";
import { MatchSections } from "@/components/matches/MatchSections";
import type { DailyFixture } from "@/lib/data/daily";

/** Case-insensitive substring match on EITHER team name. A blank query matches everything. */
function matchesQuery(f: DailyFixture, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  const a = (f.team_a ?? "").toLowerCase();
  const b = (f.team_b ?? "").toLowerCase();
  return a.includes(needle) || b.includes(needle);
}

export function MatchesSearch({
  fixtures,
  nowISO,
}: {
  fixtures: DailyFixture[];
  /** The single server reference instant (ISO), threaded straight into MatchSections. */
  nowISO: string;
}) {
  const [query, setQuery] = useState("");
  const q = query.trim();

  // Empty query -> the exact same fixture array reference, so the no-query render matches SSR.
  const filtered = useMemo(
    () => (q ? fixtures.filter((f) => matchesQuery(f, q)) : fixtures),
    [fixtures, q],
  );

  const noResults = q.length > 0 && filtered.length === 0;

  return (
    <div>
      <div className="mb-3">
        <label htmlFor="matches-search" className="sr-only">
          Search matches by team
        </label>
        <input
          id="matches-search"
          type="search"
          inputMode="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by team"
          className="w-full rounded-md border border-border bg-bg-subtle px-3 py-2 text-sm text-fg placeholder:text-muted transition focus:border-border-strong focus:outline-none"
        />
      </div>

      {noResults ? (
        <p className="rounded-card border border-border bg-surface px-4 py-3 text-sm text-muted">
          No matches for &ldquo;{q}&rdquo;.
        </p>
      ) : (
        <MatchSections fixtures={filtered} nowISO={nowISO} />
      )}
    </div>
  );
}
