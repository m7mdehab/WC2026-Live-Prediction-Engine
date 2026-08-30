import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Flag } from "@/components/ui/Flag";
import { teamCode } from "@/lib/teamCodes";
import { teamSlug } from "@/lib/teamSlug";
import { cn, simPct } from "@/lib/utils";
import type { GroupStanding, GroupStatus, TeamStanding } from "@/lib/data/groups";
import { GroupFixtures } from "@/components/groups/GroupFixtures";

/** Rank badge colour: a podium of medal hues. 1st gold, 2nd silver, 3rd bronze, 4th muted.
 *  Hues come from design tokens (globals.css) so no colour is hardcoded in the component. */
function rankBadge(rank: number): string {
  if (rank === 1) return "bg-gold/15 text-gold-strong";
  if (rank === 2) return "bg-silver/15 text-silver-strong";
  if (rank === 3) return "bg-bronze/15 text-bronze-strong";
  return "bg-elevated text-muted";
}

function statusTag(g: GroupStanding) {
  if (g.status === "live") return <Tag variant="confident">Live · {g.playedMatches} of {g.totalMatches}</Tag>;
  if (g.status === "final") return <Tag variant="up">Final</Tag>;
  return <Tag variant="neutral">Projected</Tag>;
}

/** Qualification marker (desktop): a pill in final groups, a compact code while live. */
function QualMarker({ t, status }: { t: TeamStanding; status: GroupStatus }) {
  if (status === "final") {
    if (t.advanced) return <Tag variant="up">Through</Tag>;
    if (t.isThird) return <Tag variant="upset">3rd</Tag>;
    return <Tag variant="neutral">Out</Tag>;
  }
  // live → provisional position
  if (t.advanced) return <span className="text-[10px] font-semibold text-up">Q</span>;
  if (t.isThird) return <span className="text-[10px] font-semibold text-upset">3rd</span>;
  return <span className="text-[10px] text-muted">–</span>;
}

/** Compact marker for the tight mobile row - a glyph, never a wide pill. */
function CompactMarker({ t, status }: { t: TeamStanding; status: GroupStatus }) {
  const advanced = status === "final" ? "✓" : "Q";
  if (t.advanced) return <span className="text-[11px] font-bold text-up">{advanced}</span>;
  if (t.isThird) return <span className="text-[10px] font-semibold text-upset">3rd</span>;
  return <span className="text-[11px] text-muted">{status === "final" ? "✕" : "–"}</span>;
}

const NAME_LINK = "min-w-0 truncate font-medium text-fg hover:text-confident hover:underline";

function teamHref(team: string) {
  return `/teams/${teamSlug(team)}`;
}

/** A standings row for a live/final group (full stats). Two layouts: full desktop, compact mobile. */
function StatRow({ t, status }: { t: TeamStanding; status: GroupStatus }) {
  return (
    <li className="border-b border-border last:border-0">
      {/* desktop / tablet: full P W D L GF GA GD Pts */}
      <div className="hidden items-center gap-2 py-1.5 sm:grid"
           style={{ gridTemplateColumns: "1.25rem 1.4rem minmax(0,1fr) repeat(4,1.15rem) 1.6rem 1.6rem 1.6rem 1.85rem 2.6rem" }}>
        <span className={cn("tnum grid h-5 w-5 place-items-center rounded text-[11px] font-bold", rankBadge(t.rank))}>{t.rank}</span>
        <Flag team={t.team} size="text-sm" />
        <Link href={teamHref(t.team)} className={cn(NAME_LINK, "text-sm")}>{t.team}</Link>
        <span className="tnum justify-self-end text-xs text-muted">{t.played}</span>
        <span className="tnum justify-self-end text-xs text-secondary">{t.won}</span>
        <span className="tnum justify-self-end text-xs text-secondary">{t.drawn}</span>
        <span className="tnum justify-self-end text-xs text-secondary">{t.lost}</span>
        <span className="tnum justify-self-end text-xs text-secondary">{t.gf}</span>
        <span className="tnum justify-self-end text-xs text-secondary">{t.ga}</span>
        <span className={cn("tnum justify-self-end text-xs font-medium", t.gd > 0 ? "text-up" : t.gd < 0 ? "text-down" : "text-secondary")}>
          {t.gd > 0 ? `+${t.gd}` : t.gd}
        </span>
        <span className="tnum justify-self-end text-sm font-bold text-fg">{t.points}</span>
        <span className="justify-self-end"><QualMarker t={t} status={status} /></span>
      </div>

      {/* mobile: trigram + P · GD · Pts + compact marker */}
      <div className="grid items-center gap-2 py-1.5 sm:hidden"
           style={{ gridTemplateColumns: "1.25rem 1.4rem minmax(0,1fr) 1.3rem 1.9rem 1.6rem 1.6rem" }}>
        <span className={cn("tnum grid h-5 w-5 place-items-center rounded text-[11px] font-bold", rankBadge(t.rank))}>{t.rank}</span>
        <Flag team={t.team} size="text-sm" />
        {/* full country name (min-w-0 + truncate keep the longest, e.g. "Bosnia and Herzegovina",
            on a single line that cannot overflow the card). */}
        <Link href={teamHref(t.team)} className={cn(NAME_LINK, "text-sm")}>{t.team}</Link>
        <span className="tnum justify-self-end text-xs text-muted">{t.played}</span>
        <span className={cn("tnum justify-self-end text-xs font-medium", t.gd > 0 ? "text-up" : t.gd < 0 ? "text-down" : "text-secondary")}>
          {t.gd > 0 ? `+${t.gd}` : t.gd}
        </span>
        <span className="tnum justify-self-end text-sm font-bold text-fg">{t.points}</span>
        <span className="justify-self-end"><CompactMarker t={t} status={status} /></span>
      </div>
    </li>
  );
}

/** A row for a projected group: model's finishing order + win/qualify odds (no results yet). */
function ProjRow({ t }: { t: TeamStanding }) {
  const qualify = t.pQualify ?? Math.min(1, (t.pFirst ?? 0) + (t.pBestThird ?? 0));
  return (
    <li className="grid items-center gap-2 border-b border-border py-1.5 last:border-0"
        style={{ gridTemplateColumns: "1.25rem 1.4rem minmax(0,1fr) 2.5rem 4.5rem" }}>
      <span className={cn("tnum grid h-5 w-5 place-items-center rounded text-[11px] font-bold", rankBadge(t.rank))}>{t.rank}</span>
      <Flag team={t.team} size="text-sm" />
      <Link href={teamHref(t.team)} className={cn(NAME_LINK, "text-sm")}>
        <span className="sm:hidden">{teamCode(t.team)}</span>
        <span className="hidden sm:inline">{t.team}</span>
      </Link>
      <span className="tnum justify-self-end text-xs text-secondary" title="Win group">{simPct(t.pFirst, 0)}</span>
      <span className="flex w-full items-center gap-1.5" title="Qualify">
        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-elevated">
          <span className="block h-full rounded-full bg-confident" style={{ width: `${qualify * 100}%` }} />
        </span>
        <span className="tnum w-7 shrink-0 text-right text-xs font-medium text-fg">{simPct(qualify, 0)}</span>
      </span>
    </li>
  );
}

function ColHeader({ status }: { status: GroupStatus }) {
  const base = "border-b border-border pb-1 text-[10px] font-medium tracking-wide text-muted uppercase";
  if (status === "projected") {
    return (
      <div className={cn("grid items-center gap-2", base)} style={{ gridTemplateColumns: "1.25rem 1.4rem minmax(0,1fr) 2.5rem 4.5rem" }}>
        <span /><span /><span className="min-w-0">Team</span>
        <span className="justify-self-end">Win</span>
        <span className="justify-self-end">Qualify</span>
      </div>
    );
  }
  return (
    <>
      <div className={cn("hidden items-center gap-2 sm:grid", base)}
           style={{ gridTemplateColumns: "1.25rem 1.4rem minmax(0,1fr) repeat(4,1.15rem) 1.6rem 1.6rem 1.6rem 1.85rem 2.6rem" }}>
        <span /><span /><span className="min-w-0">Team</span>
        <span className="justify-self-end">P</span><span className="justify-self-end">W</span>
        <span className="justify-self-end">D</span><span className="justify-self-end">L</span>
        <span className="justify-self-end">GF</span><span className="justify-self-end">GA</span>
        <span className="justify-self-end">GD</span><span className="justify-self-end">Pts</span><span />
      </div>
      <div className={cn("grid items-center gap-2 sm:hidden", base)}
           style={{ gridTemplateColumns: "1.25rem 1.4rem minmax(0,1fr) 1.4rem 1.85rem 2.2rem 1.5rem" }}>
        <span /><span /><span className="min-w-0">Team</span>
        <span className="justify-self-end">P</span><span className="justify-self-end">GD</span>
        <span className="justify-self-end">Pts</span><span />
      </div>
    </>
  );
}

/** Collapsible results + fixtures for a live/final group. Native <details> so the body ships in the
 *  SSR markup (deterministic, no client JS) yet stays COLLAPSED until the visitor opens it: the
 *  glance is the standings table; per-game results and upcoming kickoffs are one tap away. */
function GroupResultsDisclosure({ g }: { g: GroupStanding }) {
  if (g.fixtures.length === 0) return null;
  const played = g.fixtures.filter((f) => f.status === "completed").length;
  const upcoming = g.fixtures.length - played;
  // secondary count stays small-font on the SAME line as the label (never wraps to a 2nd line).
  const counts: string[] = [];
  if (played > 0) counts.push(`${played} played`);
  if (upcoming > 0) counts.push(`${upcoming} upcoming`);
  return (
    <details className="group mt-3 border-t border-border pt-2">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-[11px] font-medium text-secondary marker:hidden hover:text-confident">
        <span className="truncate">
          Results &amp; fixtures
          {counts.length > 0 ? <span className="ml-1 font-normal text-muted">{counts.join(" · ")}</span> : null}
        </span>
        <span aria-hidden="true" className="shrink-0 text-muted transition-transform group-open:rotate-180">{"▾"}</span>
      </summary>
      <GroupFixtures fixtures={g.fixtures} bare />
    </details>
  );
}

export function GroupStandingsCard({ g }: { g: GroupStanding }) {
  return (
    <Card className="flex flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-display text-sm font-semibold tracking-wide text-fg uppercase">Group {g.group_code}</h2>
        {statusTag(g)}
      </div>

      {g.status === "projected" ? (
        <>
          <ColHeader status="projected" />
          <ol>{g.teams.map((t) => <ProjRow key={t.team} t={t} />)}</ol>
          <p className="mt-2 text-[11px] text-muted">Projected: no matches played</p>
          {/* projected has no results strip; its fixtures stay inline (out of scope for collapse). */}
          <GroupFixtures fixtures={g.fixtures} />
        </>
      ) : (
        <>
          <ColHeader status={g.status} />
          <ol>{g.teams.map((t) => <StatRow key={t.team} t={t} status={g.status} />)}</ol>
          {/* live/final: per-game results + upcoming fixtures collapse behind a tap, collapsed by default. */}
          <GroupResultsDisclosure g={g} />
        </>
      )}
    </Card>
  );
}
