import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { StatValue } from "@/components/ui/StatValue";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";
import { simPct } from "@/lib/utils";
import type { TeamForecast } from "@/lib/types/teams";

/** The team's title odds, in the locked probability-display order: champion leads as one big number
 *  (forecast-page gold accent), then the path to it - finalist → semi → quarter → group qualification
 *  - each as a flat confidence bar. Pure presentation; every number is the run's, unchanged. */
export function TeamForecastBlock({ forecast }: { forecast: TeamForecast }) {
  const stages: { label: string; value: number | null }[] = [
    { label: "Reach the final", value: forecast.reachFinal },
    { label: "Reach the semi-finals", value: forecast.reachSf },
    { label: "Reach the quarter-finals", value: forecast.reachQf },
    { label: "Advance from the group", value: forecast.advanceGroup },
  ];

  return (
    <Card>
      <CardHeader title="Title odds" hint="champion → group" />
      <StatValue
        value={simPct(forecast.champion)}
        label="Champion"
        sub="share of simulations this team lifts the trophy"
        accent="gold"
      />
      <ul className="mt-4 space-y-3 border-t border-border pt-4">
        {stages.map((s) => (
          <li key={s.label} className="grid grid-cols-[1fr_minmax(7rem,9rem)] items-center gap-3">
            <span className="text-sm text-secondary">{s.label}</span>
            <ProbabilityBar value={s.value} variant="confident" />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Each figure is a stage-reach share.{" "}
        <Link href="/methodology#forecast-reads" className="text-confident hover:underline">
          What these numbers mean
        </Link>
      </p>
    </Card>
  );
}
