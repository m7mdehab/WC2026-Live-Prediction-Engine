"use client";

import { useEffect, useState } from "react";

// Kickoffs are stored in UTC; visitors want their own local time. We render a deterministic
// UTC string on the server / first paint (no hydration mismatch), then swap to the visitor's
// local timezone on mount. suppressHydrationWarning covers the intended text swap.

function fmtUTC(iso: string, timeOnly = false): string {
  const d = new Date(iso);
  const s = new Intl.DateTimeFormat("en-GB", {
    ...(timeOnly ? {} : { weekday: "short", day: "numeric", month: "short" }),
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
  }).format(d);
  return `${s} UTC`;
}

function fmtLocal(iso: string, timeOnly = false): string {
  const d = new Date(iso);
  const dt = new Intl.DateTimeFormat(undefined, {
    ...(timeOnly ? {} : { weekday: "short", day: "numeric", month: "short" }),
    hour: "2-digit", minute: "2-digit",
  }).format(d);
  // timeOnly keeps the line compact (the date lives elsewhere, e.g. the matchday header); the full
  // form carries the local timezone label so a bare date+time is never ambiguous.
  if (timeOnly) return dt;
  const tz =
    new Intl.DateTimeFormat(undefined, { timeZoneName: "short" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return tz ? `${dt} · ${tz}` : dt;
}

export function LocalKickoff({ iso, className, timeOnly = false }: { iso: string | null; className?: string; timeOnly?: boolean }) {
  const [text, setText] = useState<string>(iso ? fmtUTC(iso, timeOnly) : "TBD");

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (iso) setText(fmtLocal(iso, timeOnly));
  }, [iso, timeOnly]);

  if (!iso) return <span className={className}>TBD</span>;
  return (
    <time dateTime={iso} suppressHydrationWarning className={className}>
      {text}
    </time>
  );
}
