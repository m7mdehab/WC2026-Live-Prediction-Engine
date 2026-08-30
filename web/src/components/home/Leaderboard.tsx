import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { ProbabilityBar } from "@/components/ui/ProbabilityBar";
import { simPct } from "@/lib/utils";
import type { TitleRaceRow } from "@/lib/data";

// Faint gold / silver / bronze accent for the top 3 (left border + a barely-there tint).
const MEDAL: { border: string; bg: string }[] = [
  { border: "var(--gold)", bg: "color-mix(in srgb, var(--gold) 9%, transparent)" },
  { border: "var(--medal-silver-accent)", bg: "color-mix(in srgb, var(--medal-silver-accent) 11%, transparent)" },
  { border: "var(--medal-bronze-accent)", bg: "color-mix(in srgb, var(--medal-bronze-accent) 11%, transparent)" },
];

/** Champion-odds moves smaller than 0.05pp count as unchanged (mirrors dailyAuto.buildMovers). */
const EPS = 0.0005;

/** Top teams by title probability (real, from team_probabilities). Movement compares the current
 *  run against the pre-matchday run (the same pre-day run the daily briefing recaps against):
 *  rank up → green ▲, rank down → red ▼, rank unchanged → neutral "–" (with a green/red delta
 *  chip on the % when the odds moved without a rank change). When no prior run exists yet the
 *  rows render without deltas and the honest caption explains why. */
export function Leaderboard({ rows, settled = false }: { rows: TitleRaceRow[]; settled?: boolean }) {
  // A finished tournament has no meaningful rank MOVEMENT (nothing will move again) - suppress the
  // up/down arrows and the pp chips so the board reads as final standings, not a frozen live race.
  const hasDeltas = !settled && rows.some((r) => r.prevRank != null);
  return (
    <Card>
      <CardHeader title="Title race" hint={settled ? "final standings" : "by title odds"} />
      {rows.length === 0 ? (
        <p className="text-sm text-secondary">No forecast published yet.</p>
      ) : (
        <ol className="space-y-2">
          {rows.map((r, i) => {
            const medal = MEDAL[i];
            const curRank = i + 1;
            const move =
              settled || r.prevRank == null
                ? null
                : r.prevRank > curRank ? "up" : r.prevRank < curRank ? "down" : "same";
            const delta = r.prevChampion != null ? r.champion - r.prevChampion : null;
            // % delta chip only when the rank held but the odds moved (never on a finished tournament)
            const pctMoved = !settled && move === "same" && delta != null && Math.abs(delta) >= EPS;
            const pctUp = pctMoved && (delta as number) > 0;
            return (
              <li
                key={r.team}
                className="flex items-center gap-2 rounded-md py-1 pr-2 pl-2"
                style={
                  medal
                    ? { borderLeft: `2px solid ${medal.border}`, background: medal.bg }
                    : { borderLeft: "2px solid transparent" }
                }
              >
                <span className="tnum w-4 shrink-0 text-right text-xs text-muted">{curRank}</span>
                {hasDeltas ? (
                  <span
                    className={`w-3 shrink-0 text-center text-[10px] ${
                      move === "up" ? "text-up" : move === "down" ? "text-down" : "text-muted"
                    }`}
                  >
                    <span aria-hidden>{move === "up" ? "▲" : move === "down" ? "▼" : "–"}</span>
                    <span className="sr-only">
                      {move === "up"
                        ? `up from ${r.prevRank}`
                        : move === "down"
                          ? `down from ${r.prevRank}`
                          : "rank unchanged"}
                    </span>
                  </span>
                ) : null}
                <Flag team={r.team} size="text-xl" />
                <span className="w-24 shrink-0 truncate text-sm font-medium text-fg sm:w-28">{r.team}</span>
                <ProbabilityBar
                  value={r.champion}
                  variant={i === 0 ? "gold" : "confident"}
                  showValue={false}
                  className="flex-1"
                />
                {/* champion % as a dedicated right-aligned tabular column for clean scanning;
                    green/red with a signed pp chip when the odds moved without a rank change */}
                <span className="flex w-14 shrink-0 flex-col items-end">
                  <span
                    className={`tnum text-sm font-semibold ${
                      pctMoved ? (pctUp ? "text-up" : "text-down") : "text-fg"
                    }`}
                  >
                    {simPct(r.champion)}
                  </span>
                  {pctMoved ? (
                    <span
                      className={`tnum rounded-full px-1 text-[9px] font-semibold ${
                        pctUp ? "bg-up-bg text-up" : "bg-down-bg text-down"
                      }`}
                    >
                      {pctUp ? "+" : "−"}
                      {(Math.abs(delta as number) * 100).toFixed(1)}%
                    </span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {!settled && !hasDeltas && rows.length > 0 ? (
        <p className="mt-3 text-xs text-muted">Movement (▲▼) begins once matches are played.</p>
      ) : null}
    </Card>
  );
}
