import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Flag } from "@/components/ui/Flag";
import { teamCode } from "@/lib/teamCodes";
import { teamSlug } from "@/lib/teamSlug";
import { cn } from "@/lib/utils";
import type { BestThird } from "@/lib/data/groups";

/** Best-eight third-placed teams. Ranked by the third-place chain (points → overall GD → overall
 *  GS → conduct → FIFA Ranking; head-to-head is skipped - thirds from different groups have not
 *  met). The top 8 of the 12 qualify for the Round of 32. Before any results, ranked by the
 *  model's best-third probability. */
export function BestThirdsTable({ thirds, hasResults }: { thirds: BestThird[]; hasResults: boolean }) {
  if (thirds.length === 0) return null;
  const qualifying = thirds.filter((t) => t.qualifies).length;

  return (
    <Card as="section" className="mt-6">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-sm font-semibold tracking-wide text-fg uppercase">
          Best third-placed teams
        </h2>
        <span className="text-[11px] text-muted">
          top <span className="font-semibold text-up">8</span> of 12 qualify
        </span>
      </div>
      <p className="mb-3 max-w-2xl text-xs text-secondary">
        {hasResults
          ? "Ranked by the third-place chain."
          : "Ranked by the model's projected best-third probability until group results are entered."}{" "}
        <Link href="/methodology#forecast-reads" className="text-confident hover:underline">
          How thirds are ranked
        </Link>
      </p>

      {/* header */}
      <div className="hidden items-center gap-2 border-b border-border pb-1 text-[10px] font-medium tracking-wide text-muted uppercase sm:grid"
           style={{ gridTemplateColumns: "1.5rem 1.4rem minmax(0,1fr) 2rem 1.4rem 1.6rem 1.6rem 1.85rem 2rem 4.5rem" }}>
        <span /><span /><span className="min-w-0">Team</span>
        <span className="justify-self-center">Grp</span>
        <span className="justify-self-end">P</span>
        <span className="justify-self-end">GF</span>
        <span className="justify-self-end">GA</span>
        <span className="justify-self-end">GD</span>
        <span className="justify-self-end">Pts</span>
        <span className="justify-self-end">Status</span>
      </div>

      <ol>
        {thirds.map((t) => {
          const cutoff = t.rank === qualifying; // last qualifying row → draw the qualification line
          return (
            <li key={t.team}
                className={cn("border-b border-border last:border-0", cutoff && "border-b-2 border-up/40")}>
              {/* desktop */}
              <div className="hidden items-center gap-2 py-1.5 sm:grid"
                   style={{ gridTemplateColumns: "1.5rem 1.4rem minmax(0,1fr) 2rem 1.4rem 1.6rem 1.6rem 1.85rem 2rem 4.5rem" }}>
                <span className={cn("tnum justify-self-center text-xs font-bold", t.qualifies ? "text-up" : "text-muted")}>{t.rank}</span>
                <Flag team={t.team} size="text-sm" />
                <Link href={`/teams/${teamSlug(t.team)}`} className="min-w-0 truncate text-sm font-medium text-fg hover:text-confident hover:underline">{t.team}</Link>
                <span className="tnum justify-self-center text-xs text-secondary">{t.group_code}</span>
                <span className="tnum justify-self-end text-xs text-muted">{t.played}</span>
                <span className="tnum justify-self-end text-xs text-secondary">{t.gf}</span>
                <span className="tnum justify-self-end text-xs text-secondary">{t.ga}</span>
                <span className={cn("tnum justify-self-end text-xs font-medium", t.gd > 0 ? "text-up" : t.gd < 0 ? "text-down" : "text-secondary")}>
                  {t.gd > 0 ? `+${t.gd}` : t.gd}
                </span>
                <span className="tnum justify-self-end text-sm font-bold text-fg">{t.points}</span>
                <span className="justify-self-end">
                  {t.qualifies ? <Tag variant="up">Qualifies</Tag> : <Tag variant="neutral">Out</Tag>}
                </span>
              </div>

              {/* mobile */}
              <div className="grid items-center gap-2 py-1.5 sm:hidden"
                   style={{ gridTemplateColumns: "1.5rem 1.4rem minmax(0,1fr) 1.6rem 1.85rem 1.6rem 1.5rem" }}>
                <span className={cn("tnum justify-self-center text-xs font-bold", t.qualifies ? "text-up" : "text-muted")}>{t.rank}</span>
                <Flag team={t.team} size="text-sm" />
                <Link href={`/teams/${teamSlug(t.team)}`} className="tnum min-w-0 truncate text-sm font-medium text-fg">
                  {teamCode(t.team)} <span className="text-[10px] font-normal text-muted">{t.group_code}</span>
                </Link>
                <span className="tnum justify-self-end text-xs text-muted">{t.played}</span>
                <span className={cn("tnum justify-self-end text-xs font-medium", t.gd > 0 ? "text-up" : t.gd < 0 ? "text-down" : "text-secondary")}>
                  {t.gd > 0 ? `+${t.gd}` : t.gd}
                </span>
                <span className="tnum justify-self-end text-sm font-bold text-fg">{t.points}</span>
                <span className="tnum justify-self-end text-[10px] font-semibold">
                  {t.qualifies ? <span className="text-up">✓</span> : <span className="text-muted">–</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {!hasResults ? (
        <p className="mt-2 text-[11px] text-muted">
          Projected: best-third order updates from real standings once group results are entered.
        </p>
      ) : null}
    </Card>
  );
}
