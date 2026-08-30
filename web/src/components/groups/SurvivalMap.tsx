import Link from "next/link";
import { Flag } from "@/components/ui/Flag";
import { teamCode } from "@/lib/teamCodes";
import { teamSlug } from "@/lib/teamSlug";
import { cn } from "@/lib/utils";
import type { GroupsData } from "@/lib/data/groups";
import { fateOf, fateTally, fateLabel, FATE_ORDER, FATE_FILL, FATE_DOT, FATE_TEXT, type Fate } from "./fate";

// W5 direction A - TOURNAMENT-SURVIVAL MAP (the real /groups standings surface).
// All 48 teams in ONE spatial composition: 12 group clusters laid out as a single field, every team
// a cell tinted by its fate (through / 3rd-place contention / out). The whole field is legible at a
// glance and the colour IS the message - you read who survives without parsing a stack of tables.
// The order + fate come from the real engine (buildGroupsData: FIFA Article 13 top-2 + best-thirds);
// nothing is faked. Fixed cell/tile heights + the Flag's explicit pixel box keep it zero-CLS.

/** One team cell: rank, flag, 3-letter code, its points, and a fate dot. The whole cell is the /teams
 *  link, so the flag itself is rendered link=false to avoid an invalid nested anchor. `points` is a
 *  stored value (TeamStanding.points) - the settled finishing points the card used to omit; the code
 *  span stays `flex-1 truncate` so the fixed-width points token never forces overflow at 390px. */
function TeamCell({ team, rank, points, fate }: { team: string; rank: number; points: number; fate: Fate }) {
  return (
    <Link
      href={`/teams/${teamSlug(team)}`}
      title={`${team} - ${points} pts`}
      data-team-cell=""
      data-fate={fate}
      className={cn(
        "flex h-8 items-center gap-1.5 rounded-md border px-1.5 transition hover:border-border-strong",
        FATE_FILL[fate],
      )}
    >
      <span className="tnum w-3 shrink-0 text-center text-[10px] font-bold text-muted">{rank}</span>
      <Flag team={team} size="text-[11px]" link={false} />
      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-fg">{teamCode(team)}</span>
      <span data-cell-points="" className="tnum shrink-0 text-[11px] font-bold text-fg" title="Points">{points}</span>
      <span aria-hidden="true" className={cn("h-1.5 w-1.5 shrink-0 rounded-full", FATE_DOT[fate])} />
    </Link>
  );
}

export function SurvivalMap({ data }: { data: GroupsData }) {
  const tally = fateTally(data);
  // Settled-fate inputs, derived from the engine's already-applied best-third chain (no regulation
  // recomputed here): once the stage is FINAL, a 3rd-placed team in the qualified set reads "through",
  // the rest "out". Pre-settlement every 3rd place stays "contention".
  const settled = data.status === "final";
  const qualifiedThirds = new Set(data.bestThirds.filter((b) => b.qualifies).map((b) => b.team));

  return (
    <div data-survival-map="">
      {/* summary + legend in one row: the count per fate doubles as the colour key */}
      <div data-fate-legend="" className="mb-4 grid grid-cols-3 gap-2">
        {FATE_ORDER.map((f) => (
          <div
            key={f}
            data-fate-legend-item={f}
            className="flex h-14 flex-col justify-center rounded-md border border-border bg-bg-subtle px-3"
          >
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className={cn("h-2 w-2 shrink-0 rounded-full", FATE_DOT[f])} />
              <span className="tnum text-lg font-bold text-fg">{tally[f]}</span>
            </span>
            <span className={cn("truncate text-[10px] font-medium", FATE_TEXT[f])}>{fateLabel(f, data.status)}</span>
          </div>
        ))}
      </div>

      {/* the field: 12 clusters as one grid; each cluster is its group's fate-tinted team cells */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
        {data.groups.map((g) => (
          <div key={g.group_code} className="min-w-0">
            <div className="mb-1 flex items-baseline justify-between px-0.5">
              <span className="font-display text-[11px] font-bold tracking-wide text-secondary uppercase">
                Grp {g.group_code}
              </span>
              <span className="tnum text-[9px] text-muted">
                {g.status === "projected" ? "proj" : `${g.playedMatches}/${g.totalMatches}`}
              </span>
            </div>
            <div className="grid gap-1">
              {g.teams.map((t) => (
                <TeamCell key={t.team} team={t.team} rank={t.rank} points={t.points} fate={fateOf(t, qualifiedThirds.has(t.team), settled)} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
