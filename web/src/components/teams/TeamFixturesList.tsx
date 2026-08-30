import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { LocalKickoff } from "@/components/ui/LocalKickoff";
import { teamCode } from "@/lib/teamCodes";
import { venueTz, formatVenueLocal } from "@/lib/venueTz";
import { cn, simPct } from "@/lib/utils";
import type { TeamFixture } from "@/lib/types/teams";

function pickLabel(
  pa: number | null,
  pb: number | null,
): { text: string; variant: "confident" | "upset" | "neutral" } | null {
  if (pa == null || pb == null) return null;
  if (Math.abs(pa - pb) < 0.05) return { text: "Toss-up", variant: "upset" };
  if (Math.max(pa, pb) >= 0.6) return { text: "Strong pick", variant: "confident" };
  return { text: "Lean", variant: "neutral" };
}

/** The recorded final score in team_a/team_b orientation, with a "(pens)" note when a level score
 *  was decided on penalties (KO only). Null until a result is entered (the row stays a pure preview). */
function ResultChip({ f }: { f: TeamFixture }) {
  if (!f.finished || f.homeScore == null || f.awayScore == null) return null;
  const aWon = f.winnerTeam ? f.winnerTeam === f.teamA : f.homeScore > f.awayScore;
  const bWon = f.winnerTeam ? f.winnerTeam === f.teamB : f.awayScore > f.homeScore;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="tnum rounded bg-elevated px-1.5 py-0.5 text-xs font-bold text-fg">
        <span className={aWon ? "text-fg" : "text-secondary"}>{f.homeScore}</span>
        <span className="text-muted">{"–"}</span>
        <span className={bWon ? "text-fg" : "text-secondary"}>{f.awayScore}</span>
      </span>
      {f.pens ? <span className="text-[10px] font-medium text-muted">(pens)</span> : null}
    </span>
  );
}

/** One fixture row - the match-row visual language (3-way odds bar, venue-local kickoff, FIFA
 *  trigrams on mobile), as a link straight to the match page. `team` is the profile's team, so the
 *  perspective ("vs" / "@") and the highlight read from its side. */
function FixtureRow({ f, team }: { f: TeamFixture; team: string }) {
  const aFav = f.pA != null && f.pB != null && f.pA > f.pB;
  const bFav = f.pA != null && f.pB != null && f.pB > f.pA;
  const favPct = f.pA != null && f.pB != null ? Math.max(f.pA, f.pB) : null;
  const xg = f.xgA != null && f.xgB != null ? `${f.xgA.toFixed(1)}–${f.xgB.toFixed(1)}` : null;
  const label = pickLabel(f.pA, f.pB);
  const tz = venueTz(f.venue);
  const vLocal = tz ? formatVenueLocal(f.kickoffUtc, tz) : null;

  const bar = (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-elevated">
      <div className={aFav ? "bg-confident" : "bg-border-strong"} style={{ width: `${(f.pA ?? 0) * 100}%` }} />
      <div className="bg-neutral" style={{ width: `${(f.pDraw ?? 0) * 100}%` }} />
      <div className={bFav ? "bg-confident" : "bg-border-strong"} style={{ width: `${(f.pB ?? 0) * 100}%` }} />
    </div>
  );

  return (
    <Link
      href={`/match/${f.matchId}`}
      className="flex items-center gap-3 rounded-md border border-border bg-bg-subtle px-3 py-2 transition hover:bg-elevated"
    >
      {/* desktop (uses the width): kickoff + venue, full names, 3-way bar + %, xG, pick */}
      <div className="hidden w-full items-center gap-3 sm:flex">
        <div className="w-36 shrink-0 leading-tight">
          <LocalKickoff iso={f.kickoffUtc} className="tnum block text-xs text-muted" />
          <span className="block truncate text-[11px] text-muted">
            {vLocal ? <span className="tnum">{vLocal.time} {vLocal.zone} · </span> : null}
            {f.city}
          </span>
        </div>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className={cn("truncate text-sm", aFav ? "font-semibold text-fg" : "text-secondary", f.teamA === team && "text-fg")}>{f.teamA}</span>
          <Flag team={f.teamA} size="text-base" link={false} />
        </span>
        <div className="w-40 shrink-0">
          {bar}
          <div className="tnum mt-1 flex justify-between text-[10px] text-secondary">
            <span>{simPct(f.pA, 0)}</span><span>{simPct(f.pDraw, 0)}</span><span>{simPct(f.pB, 0)}</span>
          </div>
        </div>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <Flag team={f.teamB} size="text-base" link={false} />
          <span className={cn("truncate text-sm", bFav ? "font-semibold text-fg" : "text-secondary", f.teamB === team && "text-fg")}>{f.teamB}</span>
        </span>
        <span className="tnum w-16 shrink-0 text-center text-[11px] text-muted">{xg ? `xG ${xg}` : ""}</span>
        <span className="flex w-24 shrink-0 justify-start">
          {f.finished ? <ResultChip f={f} /> : label ? <Tag variant={label.variant}>{label.text}</Tag> : null}
        </span>
      </div>

      {/* mobile: FIFA trigrams, compact */}
      <div className="flex w-full items-center gap-2 sm:hidden">
        <Flag team={f.teamA} size="text-base" link={false} />
        <span className={cn("tnum w-9 shrink-0 text-sm", aFav ? "font-semibold text-fg" : "text-secondary")}>{teamCode(f.teamA)}</span>
        <div className="min-w-0 flex-1">{bar}</div>
        <span className={cn("tnum w-9 shrink-0 text-right text-sm", bFav ? "font-semibold text-fg" : "text-secondary")}>{teamCode(f.teamB)}</span>
        <Flag team={f.teamB} size="text-base" link={false} />
        <span className="tnum flex w-12 shrink-0 justify-end text-right text-xs text-secondary">
          {f.finished ? <ResultChip f={f} /> : simPct(favPct, 0)}
        </span>
      </div>
    </Link>
  );
}

/** A team's group-stage fixtures, each linking to its match page. Venue-local kickoff is shown
 *  alongside the visitor's local time (the locked design rule). */
export function TeamFixturesList({ fixtures, team }: { fixtures: TeamFixture[]; team: string }) {
  return (
    <Card>
      <CardHeader title="Fixtures & results" hint="group stage · model odds, final scores once played" />
      {fixtures.length === 0 ? (
        <p className="text-sm text-muted">No fixtures available for this team yet.</p>
      ) : (
        <div className="space-y-2">
          {fixtures.map((f) => (
            <FixtureRow key={f.matchId} f={f} team={team} />
          ))}
        </div>
      )}
      <p className="mt-3 text-xs text-muted">
        Kickoffs show your local time and the venue-local time. Open any match for the full breakdown.
      </p>
    </Card>
  );
}
