import { Card, CardHeader } from "@/components/ui/Card";
import type { RoundDef, ScoringMode } from "@/lib/types/humans";

/** The transparent, round-weighted points scheme, shown verbatim so the scoring is honest. */
export function ScoringRubric({ rubric }: { rubric: RoundDef[]; mode?: ScoringMode }) {
  const max = rubric.reduce((s, r) => s + r.per * r.slots, 0);
  return (
    <Card>
      <CardHeader title="How scoring works" hint={`max ${max} pts`} />
      <p className="mb-3 text-sm text-secondary">
        A simple round-weighted scheme: deeper correct calls are worth more. Each entry (the model
        included) earns points for agreement with actual results, with no upset bonuses or tie-breakers
        {" "}(richer leaderboard scoring is a V2 idea, deliberately out of scope pre-launch).
      </p>
      <ul className="divide-y divide-border text-sm">
        {rubric.map((r) => (
          <li key={r.key} className="flex items-baseline justify-between gap-3 py-1.5">
            <span>
              <span className="font-medium text-fg">{r.label}</span>
              <span className="text-muted">: {r.blurb}</span>
            </span>
            <span className="tnum shrink-0 font-semibold text-confident">
              {r.per} pt{r.per === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
