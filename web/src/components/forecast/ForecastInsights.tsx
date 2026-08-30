import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { rawPct } from "@/lib/utils";
import type { DarkHorse, Overvalued } from "@/lib/types/forecast";

/** 0-100 surprise score for display (the index is in [0,1]). */
function score(index: number): number {
  return Math.round(index * 100);
}

/** Dark horses - unfancied sides (OUTSIDE the pre-tournament top 12 by frozen champion odds) whose
 *  ACHIEVED outcome ran furthest ahead of their frozen baseline (the sticky surprise index). A
 *  pre-tournament favourite is never here, however deep it runs. Sticky: an eliminated over-performer
 *  stays on the board. The population is stated in the subtitle; the method lives on the methodology
 *  page. */
export function DarkHorsesCard({ teams }: { teams: DarkHorse[] }) {
  return (
    <Card>
      <div data-surprise-card="dark-horses">
        <CardHeader title="Dark horses" hint="beat the baseline" />
        <p className="mb-3 text-xs text-secondary">
          Unfancied sides (outside the pre-tournament top 12) beating their odds.{" "}
          <Link href="/methodology#forecast-reads" className="text-confident hover:underline">
            How this is ranked
          </Link>
        </p>
        {teams.length === 0 ? (
          <p className="text-sm text-muted">
            No team has yet out-run its pre-tournament baseline.
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {teams.map((t) => (
                <li key={t.team} className="flex items-center gap-2 sm:gap-3">
                  <Flag team={t.team} size="text-lg" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{t.team}</span>
                  <span className="tnum shrink-0 text-right text-xs text-muted">
                    {t.deepestStageLabel}
                  </span>
                  <Tag variant="up" className="shrink-0 whitespace-nowrap">▲ {score(t.surpriseIndex)}</Tag>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted">
              ▲ = surprise index (0 to 100).
            </p>
          </>
        )}
      </div>
    </Card>
  );
}

/** Overvalued - the mirror, restricted to INSIDE the pre-tournament top 12 (elite favourites by frozen
 *  champion odds): a strong pedigree the ACHIEVED outcome did not back. A low-rated early-exit team is
 *  never here. Ranked by FIFA-rank percentile minus achieved-outcome percentile. */
export function OvervaluedCard({ teams }: { teams: Overvalued[] }) {
  return (
    <Card>
      <div data-surprise-card="overvalued">
        <CardHeader title="Overvalued" hint="rank > result" />
        <p className="mb-3 text-xs text-secondary">
          Pre-tournament top 12 falling short.{" "}
          <Link href="/methodology#forecast-reads" className="text-confident hover:underline">
            How this is ranked
          </Link>
        </p>
        {teams.length === 0 ? (
          <p className="text-sm text-muted">No highly-ranked team is trailing its result enough to flag.</p>
        ) : (
          <>
            <ul className="space-y-2">
              {teams.map((t) => (
                <li key={t.team} className="flex items-center gap-3">
                  <Flag team={t.team} size="text-lg" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{t.team}</span>
                  <span className="tnum hidden text-right text-xs text-muted sm:block">
                    {t.fifaRank != null ? `FIFA #${t.fifaRank}` : "unranked"} · {t.deepestStageLabel}
                  </span>
                  {/* raw-pct-ok: percentile gap (a difference between two ranks), not a probability */}
                  <Tag variant="down">▼ {rawPct(t.gap, 0)}</Tag>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted">
              ▼ = FIFA-rank percentile minus achieved-outcome percentile.
            </p>
          </>
        )}
      </div>
    </Card>
  );
}
