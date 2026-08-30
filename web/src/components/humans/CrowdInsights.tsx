import { Card, CardHeader } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { TeamName } from "@/components/humans/parts";
import { rawPct, simPct } from "@/lib/utils";
import type { CrowdInsights as CrowdInsightsT, ModelBenchmark, ScoringMode } from "@/lib/types/humans";

/** One row of the COMBINED most-picked card (B.2): flag + name on the left, and on the SAME line two
 *  small-font figures - how often the crowd picked the team to REACH THE FINAL and to be CHAMPION
 *  (count + %). Single line, no wrap, no overflow: the name truncates, the figures never shrink. */
function MostPickedRow({
  row,
}: {
  row: { team: string; finalistCount: number; finalistShare: number; champCount: number; champShare: number };
}) {
  return (
    <li className="flex items-center gap-2">
      <div className="min-w-0 flex-1"><TeamName team={row.team} strong /></div>
      <span className="tnum w-16 shrink-0 text-right text-[11px] text-secondary">
        {/* raw-pct-ok: counted human-entry share (finalists / total), not a Monte-Carlo probability */}
        {row.finalistCount}<span className="text-muted"> · {rawPct(row.finalistShare, 0)}</span>
      </span>
      <span className="tnum w-16 shrink-0 text-right text-[11px] text-secondary">
        {/* raw-pct-ok: counted human-entry share (picks / total), not a Monte-Carlo probability */}
        {row.champCount}<span className="text-muted"> · {rawPct(row.champShare, 0)}</span>
      </span>
    </li>
  );
}

/** Honest, simple crowd aggregates. The COMBINED "Most-picked" card (B.2) replaces the two separate
 *  champion/finalists cards: one row per team carrying BOTH its reach-the-final and champion pick
 *  rates. The "Crowd vs the model" card is a DESCRIPTIVE comparison (not scoring) - the model is a
 *  competitor, not the yardstick. */
export function CrowdInsights({
  crowd, model, mode,
}: { crowd: CrowdInsightsT; model: ModelBenchmark; mode: ScoringMode }) {
  const dis = crowd.biggestDisagreement;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card>
        <CardHeader title="Most-picked" hint={`${crowd.total} brackets`} />
        {crowd.mostPicked.length ? (
          <>
            <div className="mb-2 flex items-center gap-2 pl-7 text-[10px] tracking-wide text-muted uppercase">
              <span className="flex-1" />
              <span className="w-16 text-right">reach final</span>
              <span className="w-16 text-right">champion</span>
            </div>
            <ul className="space-y-1.5">
              {crowd.mostPicked.map((r) => <MostPickedRow key={r.team} row={r} />)}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted">No picks yet.</p>
        )}
        {crowd.v1Count > 0 ? (
          <p className="mt-3 text-xs text-muted">
            {crowd.v1Count} of {crowd.total} brackets recorded only group winners + champion, so they
            count toward champion picks but not reach-the-final picks.
          </p>
        ) : null}
      </Card>

      <Card>
        <CardHeader title="Crowd vs the model" hint="the model’s current projection" />
        <div className="space-y-3 text-sm">
          {/* DESCRIPTIVE only: this card compares the crowd to the model's CURRENT read (live
              re-projection), distinct from the leaderboard, where the model competes with its FROZEN
              pre-tournament bracket. */}
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="tnum font-display text-2xl font-bold text-fg">
                {/* raw-pct-ok: counted share of human entries, not a Monte-Carlo probability */}
                {rawPct(crowd.shareWithModelChampion, 0)}
              </span>
              <span className="text-secondary">back the model’s current pick</span>
            </div>
            {model.champion ? (
              <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                <span>that&apos;s</span><TeamName team={model.champion} strong />
              </div>
            ) : null}
          </div>

          {dis ? (
            <div className="border-t border-border pt-3">
              <div className="mb-1 text-xs font-semibold tracking-wide text-muted uppercase">
                Biggest disagreement
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <TeamName team={dis.team} strong />
                <Tag variant={dis.delta >= 0 ? "upset" : "down"}>
                  {dis.delta >= 0 ? "crowd backs more" : "crowd backs less"}
                </Tag>
              </div>
              <p className="tnum mt-1 text-xs text-secondary">
                {/* raw-pct-ok: crowdShare is a counted human-entry share; modelProb (a sim probability) uses simPct */}
                crowd {rawPct(dis.crowdShare, 0)} vs {benchShortNoun(mode)} {simPct(dis.modelProb, 0)}
                {/* raw-pct-ok: signed crowd-minus-model difference (can be negative); simPct would clamp it */}
                {" "}({dis.delta >= 0 ? "+" : ""}{rawPct(dis.delta, 0)})
              </p>
            </div>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

const benchShortNoun = (mode: ScoringMode): string => (mode === "results" ? "result" : "model");
