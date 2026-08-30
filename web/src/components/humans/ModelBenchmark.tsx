import { Card, CardHeader } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { TeamName } from "@/components/humans/parts";
import type { ModelBenchmark as ModelBenchmarkT, ScoringMode } from "@/lib/types/humans";

function Row({ label, teams, emphasis }: { label: string; teams: string[]; emphasis?: boolean }) {
  if (teams.length === 0) return null;
  return (
    <div className="flex flex-col gap-1 border-t border-border py-2 first:border-t-0 sm:flex-row sm:items-start sm:gap-3">
      <div className="w-28 shrink-0 text-xs font-semibold tracking-wide text-muted uppercase">{label}</div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {teams.map((t) => <TeamName key={t} team={t} strong={emphasis} />)}
      </div>
    </div>
  );
}

/** The model's own FROZEN pre-tournament bracket, shown as one competitor (not the scoring yardstick).
 *  Doubles as the low-N headline before there are enough human brackets to surface crowd insights.
 *  When `model` is null (no frozen cond0 bracket exists) it renders a VISIBLE unavailable state - the
 *  model competitor was dropped from the leaderboard rather than scored with the live (foresight)
 *  bracket, so we say so honestly instead of showing a bracket the model never committed. */
export function ModelBenchmark({ model }: { model: ModelBenchmarkT | null; mode?: ScoringMode }) {
  if (!model) {
    return (
      <Card>
        <CardHeader title="The model's pre-tournament bracket" hint="the AI competitor" />
        <div className="mb-3 flex items-center gap-2">
          <Tag variant="neutral">Pre-tournament bracket unavailable</Tag>
        </div>
        <p className="text-sm text-secondary">
          The model&apos;s locked pre-tournament (cond0) bracket isn&apos;t available, so the model
          isn&apos;t ranked as a competitor here. We do not substitute its live projection: that would
          score the model with hindsight the human entrants never had.
        </p>
      </Card>
    );
  }
  const gwTeams = Object.keys(model.groupWinners).sort().map((g) => model.groupWinners[g]);
  return (
    <Card>
      <CardHeader title="The model's pre-tournament bracket" hint="the AI competitor" />
      {model.champion ? (
        <div className="mb-3 flex items-center gap-2">
          <Tag variant="gold">Champion</Tag>
          <TeamName team={model.champion} strong />
        </div>
      ) : null}
      <div className="text-sm">
        <Row label="Finalists" teams={model.finalists} emphasis />
        <Row label="Semi-finals" teams={model.reachSF} />
        <Row label="Quarter-finals" teams={model.reachQF} />
        <Row label="Group winners" teams={gwTeams} />
      </div>
      <p className="mt-3 text-xs text-muted">
        This is the model&apos;s PRE-TOURNAMENT bracket, locked before kickoff like every human and
        ranked alongside the human entries, scored against actual results by the same rule
        {model.runId ? <> · run <span className="tnum">{model.runId}</span></> : null}.
      </p>
    </Card>
  );
}
