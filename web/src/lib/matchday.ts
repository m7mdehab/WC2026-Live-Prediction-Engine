// Shared matchday bucketing (home "Upcoming matches" + the /matches index). Group by the visitor's
// LOCAL calendar date when `local` is true (post-mount), else by UTC date (deterministic SSR /
// first paint), so the header and the printed kickoff time always share one timezone.

export function matchDayBucket(iso: string | null, local: boolean): { key: string; label: string } {
  if (!iso) return { key: "tbd", label: "Date to be confirmed" };
  const d = new Date(iso);
  if (local) {
    return {
      key: `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`,
      label: new Intl.DateTimeFormat(undefined, {
        weekday: "long", day: "numeric", month: "long",
      }).format(d),
    };
  }
  return {
    key: iso.slice(0, 10),
    label: new Intl.DateTimeFormat("en-GB", {
      weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
    }).format(d),
  };
}

/** Group items (already sorted by kickoff) into consecutive matchdays. */
export function groupByDay<T extends { kickoff_utc: string | null }>(
  items: T[],
  local: boolean
): { key: string; label: string; matches: T[] }[] {
  const days: { key: string; label: string; matches: T[] }[] = [];
  for (const m of items) {
    const { key, label } = matchDayBucket(m.kickoff_utc, local);
    const last = days[days.length - 1];
    if (last && last.key === key) last.matches.push(m);
    else days.push({ key, label, matches: [m] });
  }
  return days;
}
