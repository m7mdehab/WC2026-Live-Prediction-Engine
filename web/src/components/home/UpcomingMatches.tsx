"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { LocalKickoff } from "@/components/ui/LocalKickoff";
import { FormChips } from "@/components/ui/FormChips";
import { MatchGlanceTile } from "@/components/match/MatchGlanceTile";
import { whyFavored } from "@/lib/whyLine";
import { groupByDay } from "@/lib/matchday";
import { simPct } from "@/lib/utils";
import type { UpcomingMatch } from "@/lib/types";

function MatchCard({ m }: { m: UpcomingMatch }) {
  const p = m.probs;
  const pa = p?.p_team_a_win ?? 0;
  const pd = p?.p_draw ?? 0;
  const pb = p?.p_team_b_win ?? 0;
  const why = whyFavored(m);

  const favA = why.favored === m.team_a;
  const favB = why.favored === m.team_b;
  const segA = favA ? "bg-confident" : "bg-border-strong";
  const segB = favB ? "bg-confident" : "bg-border-strong";

  return (
    <Link
      href={`/match/${m.match_id}`}
      className="block min-w-0 rounded-md border border-border bg-bg-subtle p-3 transition hover:border-border-strong hover:bg-elevated"
    >
      <div className="flex items-center justify-between text-xs text-muted">
        <LocalKickoff iso={m.kickoff_utc} className="tnum" />
        <span className="truncate pl-2">
          {[m.city, m.country].filter(Boolean).join(", ")}
        </span>
      </div>

      {/* teams */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Flag team={m.team_a} size="text-2xl" link={false} />
          <span className="truncate text-sm font-semibold text-fg">{m.team_a}</span>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-muted">vs</span>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-right text-sm font-semibold text-fg">{m.team_b}</span>
          <Flag team={m.team_b} size="text-2xl" link={false} />
        </div>
      </div>

      {/* W / D / L split */}
      <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-elevated">
        <div className={segA} style={{ width: `${pa * 100}%` }} />
        <div className="bg-neutral" style={{ width: `${pd * 100}%` }} />
        <div className={segB} style={{ width: `${pb * 100}%` }} />
      </div>
      <div className="tnum mt-1.5 flex justify-between text-[11px] text-secondary">
        <span className={favA ? "font-semibold text-confident" : ""}>{simPct(pa)} win</span>
        <span>{simPct(pd)} draw</span>
        <span className={favB ? "font-semibold text-confident" : ""}>{simPct(pb)} win</span>
      </div>

      {/* xG */}
      {p?.exp_goals_a != null && p?.exp_goals_b != null ? (
        <p className="tnum mt-2 text-[11px] text-muted">
          Expected goals{" "}
          <span className="font-medium text-secondary">
            {p.exp_goals_a.toFixed(2)} – {p.exp_goals_b.toFixed(2)}
          </span>
        </p>
      ) : null}

      {/* why favored, every clause traced to the match's factor data (rating/host/altitude) */}
      <div className="mt-2 flex items-start gap-2 border-t border-border pt-2">
        {why.confidence === "coinflip" ? (
          <Tag variant="upset" className="mt-0.5 shrink-0">Coin-flip</Tag>
        ) : why.confidence === "high" ? (
          <Tag variant="confident" className="mt-0.5 shrink-0">Strong pick</Tag>
        ) : null}
        <p className="text-xs leading-relaxed text-secondary">{why.sentence}</p>
      </div>

      {/* recent form, both teams' literal last-6 results as chips */}
      {m.factors ? (
        <div className="mt-2 space-y-1.5">
          <p className="text-[10px] font-semibold tracking-wide text-muted uppercase">Recent form</p>
          <FormChips team={m.team_a} form={m.factors.recent_form.team_a} />
          <FormChips team={m.team_b} form={m.factors.recent_form.team_b} />
        </div>
      ) : null}
    </Link>
  );
}

// Fill whole matchdays up to this many matches, never split a day across the widget boundary.
const MATCH_CAP = 8;

/** Upcoming fixtures shown as COMPLETE matchdays only (day header per day, bucketed by the
 *  visitor's local date so header and kickoff times always agree). When the next full day won't
 *  fit the cap we stop at the previous day's end and link to the full matches page.
 *
 *  `variant` picks the surface: "desktop" keeps the roomy multi-fact tile (unchanged, design-locked
 *  desktop shell); "mobile" swaps to the compact glance tile (MatchGlanceTile) two-up at the phone
 *  base breakpoint, with the multi-fact content living one tap away on /match/[id]. */
export function UpcomingMatches({
  matches,
  total,
  variant = "desktop",
}: {
  matches: UpcomingMatch[];
  total: number;
  variant?: "desktop" | "mobile";
}) {
  const dense = variant === "mobile";
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const days = groupByDay(matches, mounted);
  const selected: typeof days = [];
  let count = 0;
  for (const d of days) {
    if (selected.length > 0 && count + d.matches.length > MATCH_CAP) break;
    selected.push(d);
    count += d.matches.length;
  }
  const truncated = total > count;

  return (
    <Card>
      <CardHeader title="Upcoming matches" hint="next matchdays" />
      {count === 0 ? (
        <p className="text-sm text-secondary">No upcoming matches scheduled.</p>
      ) : (
        <div className={dense ? "space-y-3" : "space-y-4"}>
          {selected.map((d) => (
            <div key={d.key}>
              <h4
                suppressHydrationWarning
                className="mb-2 text-xs font-semibold tracking-wide text-secondary uppercase"
              >
                {d.label}
              </h4>
              {dense ? (
                // Phone surface: two-up at the base breakpoint with the compact glance tile.
                <div className="grid grid-cols-2 gap-2">
                  {d.matches.map((m) => (
                    <MatchGlanceTile key={m.match_id} m={m} />
                  ))}
                </div>
              ) : (
                // Desktop shell (design-locked): the roomy multi-fact tile, unchanged.
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {d.matches.map((m) => (
                    <MatchCard key={m.match_id} m={m} />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {truncated ? (
        <div className="mt-4 border-t border-border pt-3 text-right">
          <Link href="/matches" className="text-sm font-medium text-confident hover:underline">
            View all matches →
          </Link>
        </div>
      ) : null}
    </Card>
  );
}
