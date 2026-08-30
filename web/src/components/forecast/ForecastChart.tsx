import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";
import { simPct } from "@/lib/utils";
import type { ForecastTeam } from "@/lib/types/forecast";

// Faint gold / silver / bronze accent for the top 3 - the same treatment as the home title race.
const MEDAL: { border: string; bg: string }[] = [
  { border: "var(--gold)", bg: "color-mix(in srgb, var(--gold) 9%, transparent)" },
  { border: "var(--medal-silver-accent)", bg: "color-mix(in srgb, var(--medal-silver-accent) 11%, transparent)" },
  { border: "var(--medal-bronze-accent)", bg: "color-mix(in srgb, var(--medal-bronze-accent) 11%, transparent)" },
];

/** Champion-probability ranking, home title-race style: the leading contenders as flag + name +
 *  gold bar + bold %. The full 48-team field lives in the table below; this is the headline cut. */
export function ForecastChart({ teams, top = 16 }: { teams: ForecastTeam[]; top?: number }) {
  const rows = teams.slice(0, top);
  const max = rows[0]?.champion ?? 0;
  return (
    <Card>
      <CardHeader title="Champion probability" hint={`top ${rows.length} of ${teams.length}`} />
      {rows.length === 0 ? (
        <p className="text-sm text-secondary">No forecast published yet.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => {
            const medal = MEDAL[i];
            return (
              <li
                key={r.team}
                className="flex items-center gap-3 rounded-md py-1 pr-2 pl-2"
                style={
                  medal
                    ? { borderLeft: `2px solid ${medal.border}`, background: medal.bg }
                    : { borderLeft: "2px solid transparent" }
                }
              >
                <span className="tnum w-5 shrink-0 text-right text-xs text-muted">{i + 1}</span>
                <Flag team={r.team} size="text-xl" link={false} />
                <span className="w-24 shrink-0 truncate text-sm font-medium text-fg sm:w-32">{r.team}</span>
                <ProbabilityBar
                  value={max > 0 ? (r.champion ?? 0) / max : 0}
                  variant={i === 0 ? "gold" : "confident"}
                  showValue={false}
                  className="flex-1"
                />
                <span className="tnum w-14 shrink-0 text-right text-sm font-semibold text-fg">
                  {simPct(r.champion)}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-3 text-xs text-muted">
        Bars are scaled to the leader; the % is the model&apos;s absolute title odds.
      </p>
    </Card>
  );
}
