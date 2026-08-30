import { Card, CardHeader } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { FormChips } from "@/components/ui/FormChips";
import { formRecord } from "@/lib/whyLine";
import { cn, simPct } from "@/lib/utils";
import { WinProbTrend } from "@/components/match/WinProbTrend";
import { flagColor } from "@/lib/flagColors";
import type { MatchDetail, MatchPlayerLine, MatchTeamStatLine } from "@/lib/types";

const prettyComp = (c: string) => c.replace(/_/g, " ");
const rec = (f: { w: number; d: number; l: number }) => `${f.w}W-${f.d}D-${f.l}L`;

/** The full per-match breakdown cards - the single source of truth shared by the canonical
 *  /match page and the expandable /matches row. Given a MatchDetail; renders everything below the
 *  team header (prediction, what's-driving, factor breakdown, scorelines, recent form, H2H). */
export function MatchBody({ detail }: { detail: MatchDetail }) {
  const { fixture, probs, factors, scorelines, h2h, contributions, winProbTrend,
          winnerTeam, pens, endState, teamStats } = detail;
  const result = detail.result ?? null;
  const finished = detail.finished ?? false;
  const a = fixture.team_a as string;
  const b = fixture.team_b as string;

  const pa = probs?.p_team_a_win ?? null;
  const pd = probs?.p_draw ?? null;
  const pb = probs?.p_team_b_win ?? null;
  const hasProbs = pa != null && pd != null && pb != null;
  const favored = pa != null && pb != null && Math.abs(pa - pb) >= 0.05 ? (pa > pb ? a : b) : null;
  const opp = favored === a ? b : a;

  const rg = factors?.rating_gap;
  const host = factors?.host_effect;
  const alt = factors?.altitude;

  let driver: { tag: string; text: string } | null = null;
  if (factors && rg) {
    if (rg.band === "large" && rg.favored && rg.diff != null) {
      driver = { tag: "Rating", text: `${rg.favored} hold a decisive rating edge: +${Math.round(Math.abs(rg.diff))} Elo over ${rg.favored === a ? b : a}.` };
    } else if (host?.applies && host.team === favored) {
      driver = { tag: "Host", text: `${favored} play at home as World Cup hosts.` };
    } else if (alt?.applies && alt.disadvantaged_team === opp) {
      driver = { tag: "Altitude", text: `${alt.disadvantaged_team} give up ~${alt.burden_km.toFixed(1)} km of altitude${fixture.city ? ` in ${fixture.city}` : ""}.` };
    } else if ((rg.band === "moderate" || rg.band === "slight") && rg.favored && rg.diff != null) {
      driver = { tag: "Rating", text: `${rg.favored} have a ${rg.band} rating edge (+${Math.round(Math.abs(rg.diff))} Elo).` };
    } else {
      driver = { tag: "Even", text: "The model rates these sides near-level, closer to a coin-flip." };
    }
  }

  const formA = factors?.recent_form.team_a ?? [];
  const formB = factors?.recent_form.team_b ?? [];

  return (
    <div className="grid gap-4">
      {/* Final result: a FINISHED match ALWAYS shows its result here - the score (or an honest
          "this match has finished" fallback when no score is recorded), EVEN when it still carries
          pre-match odds, as a finished knockout often does. The winner is emphasised on a decisive
          scoreline; a level score names no winner (we never invent a shootout result). The pre-match
          projection, when present, renders below as a clearly-labelled reference card. */}
      {finished ? (
        <Card>
          <CardHeader title="Final result" hint="full time" />
          {result ? (
            <div className="flex items-center justify-center gap-3 py-1">
              <span className={cn("min-w-0 truncate text-sm", result.a > result.b ? "font-semibold text-fg" : "text-secondary")}>{a}</span>
              <span className="tnum shrink-0 font-display text-2xl font-bold text-fg">
                {result.a} – {result.b}
              </span>
              <span className={cn("min-w-0 truncate text-sm", result.b > result.a ? "font-semibold text-fg" : "text-secondary")}>{b}</span>
            </div>
          ) : (
            <p className="py-1 text-center text-sm text-secondary">This match has finished.</p>
          )}
          {/* Shootout / advancer (Wave 1.7): a level knockout is decided on penalties - name the
              advancing team and, once the tally is captured, the pens score. Non-shootout knockouts
              show who advanced; a group match carries no winner_team so nothing renders. */}
          {winnerTeam ? (
            <p className="mt-1 text-center text-sm text-secondary">
              <span className="font-semibold text-fg">{winnerTeam}</span>
              {endState === "penalties" || (pens != null && result != null && result.a === result.b)
                ? pens != null
                  ? ` advance on penalties (${pens.a}–${pens.b})`
                  : " advance on penalties"
                : endState === "extra_time"
                  ? " advance after extra time"
                  : " advance"}
            </p>
          ) : null}
          <p className="mt-3 border-t border-border pt-2 text-xs text-muted">
            {hasProbs
              ? "Final score. The model's pre-match prediction is shown below for reference; the result now feeds the forecast for the rest of the tournament."
              : "This match is finished, so the model no longer carries odds for it. The result now feeds the forecast for the rest of the tournament."}
          </p>
        </Card>
      ) : null}

      {/* Goals and cards (finished only) - pure display of player_match_stats we already ingest.
          Own goals surface under the team that BENEFITED, marked OG. No minute data is stored, so
          lines are tallies, not timelines. */}
      {finished && contributions ? (
        <Card>
          <CardHeader title="Goals and cards" hint="scorers and bookings" />
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <ContribColumn team={a} own={contributions.team_a} otherOwnGoals={contributions.team_b} />
            <ContribColumn team={b} own={contributions.team_b} otherOwnGoals={contributions.team_a} />
          </div>
        </Card>
      ) : null}

      {/* Model prediction. Shown for every upcoming match, and kept (clearly labelled as the
          pre-match read) BENEATH the result for a finished match that still carries odds. Hidden only
          for a finished match with no odds, where the Final result card above stands alone. */}
      {!finished || hasProbs ? (
      <Card>
        <CardHeader title={finished ? "Pre-match prediction" : "Model prediction"} hint={finished ? "pre-match odds" : "win / draw / win"} />
        <div className="flex h-2.5 overflow-hidden rounded-full bg-elevated">
          <div className={favored === a ? "bg-confident" : "bg-border-strong"} style={{ width: `${(pa ?? 0) * 100}%` }} />
          <div className="bg-neutral" style={{ width: `${(pd ?? 0) * 100}%` }} />
          <div className={favored === b ? "bg-confident" : "bg-border-strong"} style={{ width: `${(pb ?? 0) * 100}%` }} />
        </div>
        <div className="tnum mt-2 flex justify-between text-sm">
          <span className={cn(favored === a && "font-semibold text-confident")}>{simPct(pa)} {a}</span>
          <span className="text-secondary">{simPct(pd)} draw</span>
          <span className={cn(favored === b && "font-semibold text-confident")}>{simPct(pb)} {b}</span>
        </div>
        {probs?.exp_goals_a != null && probs?.exp_goals_b != null ? (
          <p className="tnum mt-3 border-t border-border pt-2 text-sm text-secondary">
            Expected goals{" "}
            <span className="font-medium text-fg">{probs.exp_goals_a.toFixed(2)} – {probs.exp_goals_b.toFixed(2)}</span>
          </p>
        ) : null}
        {driver ? (
          <div className="mt-3 flex items-start gap-2 rounded-md bg-bg-subtle p-3">
            <Tag variant="gold" className="mt-0.5 shrink-0">{driver.tag}</Tag>
            <p className="text-sm leading-relaxed text-secondary">
              <span className="font-medium text-fg">What&apos;s driving this:</span> {driver.text}
            </p>
          </div>
        ) : null}
      </Card>
      ) : null}

      {/* win probability over time (Wave 1.4) - hidden when history is too thin to draw a trend */}
      {winProbTrend && winProbTrend.length >= 2 ? (
        <WinProbTrend teamA={a} teamB={b} points={winProbTrend} />
      ) : null}

      {/* factor breakdown */}
      {factors ? (
        <Card>
          <CardHeader title="Why: factor breakdown" hint="every clause from real data" />
          <ul className="divide-y divide-border text-sm">
            {rg && rg.elo_a != null && rg.elo_b != null ? (
              <li className="flex items-start justify-between gap-3 py-2">
                <div>
                  <div className="font-medium text-fg">Elo rating</div>
                  <div className="tnum text-secondary">{a} {rg.elo_a} · {b} {rg.elo_b}</div>
                </div>
                {rg.band && rg.diff != null ? (
                  <Tag variant={rg.band === "negligible" ? "neutral" : "confident"} className="mt-0.5 shrink-0">
                    {rg.favored === a ? a : b} +{Math.round(Math.abs(rg.diff))} · {rg.band}
                  </Tag>
                ) : null}
              </li>
            ) : null}
            <li className="flex items-start justify-between gap-3 py-2">
              <div className="shrink-0 font-medium text-fg">FIFA ranking</div>
              <div className="tnum min-w-0 text-right text-secondary">
                {a} #{factors.fifa_rank.team_a ?? "—"} · {b} #{factors.fifa_rank.team_b ?? "—"}
              </div>
            </li>
            {host?.applies ? (
              <li className="flex items-start justify-between gap-3 py-2">
                <div>
                  <div className="font-medium text-fg">Host advantage</div>
                  <div className="text-secondary">{host.team} playing on home soil</div>
                </div>
                <Tag variant="up" className="mt-0.5 shrink-0">+{host.coef_log_goals.toFixed(2)} goal rate</Tag>
              </li>
            ) : null}
            {alt?.applies ? (
              <li className="flex items-start justify-between gap-3 py-2">
                <div>
                  <div className="font-medium text-fg">Altitude</div>
                  <div className="text-secondary">
                    {alt.disadvantaged_team} concede ~{alt.burden_km.toFixed(1)} km{fixture.city ? ` in ${fixture.city}` : ""}
                  </div>
                </div>
                <Tag variant="down" className="mt-0.5 shrink-0">{alt.goal_rate_penalty_log.toFixed(2)} goal rate</Tag>
              </li>
            ) : null}
            <li className="flex items-start justify-between gap-3 py-2">
              <div className="shrink-0 font-medium text-fg">Recent form</div>
              <div className="tnum min-w-0 text-right text-secondary">
                {a} {rec(formRecord(formA))} · {b} {rec(formRecord(formB))}
              </div>
            </li>
          </ul>
        </Card>
      ) : null}

      {/* most-likely scorelines. For a finished match this is the model's PRE-MATCH distribution
          (run-independent base Dixon-Coles), so it is labelled as such - an honest record of what
          the model expected before kickoff, not a live read. */}
      <Card>
        <CardHeader title="Most-likely scorelines" hint={finished ? "pre-match · Dixon-Coles" : "Dixon-Coles"} />
        {scorelines && scorelines.length ? (
          <ul className="space-y-2">
            {scorelines.map((s) => {
              const fill = s.result === "a" ? "bg-confident" : s.result === "b" ? "bg-border-strong" : "bg-neutral";
              const max = scorelines[0].p || 1;
              return (
                <li key={s.score} className="flex items-center gap-3">
                  <span className="tnum w-10 shrink-0 text-sm font-semibold text-fg">{s.score}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
                    <div className={cn("h-full rounded-full", fill)} style={{ width: `${(s.p / max) * 100}%` }} />
                  </div>
                  <span className="tnum w-12 shrink-0 text-right text-xs text-secondary">{simPct(s.p)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-sm text-muted">Scorelines populate when the run&apos;s extras are published.</p>
        )}
      </Card>

      {/* recent form chips */}
      {factors ? (
        <Card>
          <CardHeader title="Recent form" hint="last 6 competitive" />
          <div className="space-y-2">
            <FormChips team={a} form={formA} />
            <FormChips team={b} form={formB} />
          </div>
        </Card>
      ) : null}

      {/* team match stats (Wave 1.6) - display-only possession/shots/etc.; hidden until ingested */}
      {teamStats ? <TeamStatsCard teamA={a} teamB={b} stats={teamStats} /> : null}

      {/* head to head */}
      <Card>
        <CardHeader title="Head to head" hint="historical meetings" />
        {h2h && h2h.played > 0 ? (
          <>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-elevated">
              <div className="bg-confident" style={{ width: `${(h2h.a_wins / h2h.played) * 100}%` }} />
              <div className="bg-neutral" style={{ width: `${(h2h.draws / h2h.played) * 100}%` }} />
              <div className="bg-border-strong" style={{ width: `${(h2h.b_wins / h2h.played) * 100}%` }} />
            </div>
            <div className="tnum mt-2 flex justify-between text-sm">
              <span><span className="font-semibold text-fg">{h2h.a_wins}</span> {a}</span>
              <span className="text-secondary">{h2h.draws} draw</span>
              <span><span className="font-semibold text-fg">{h2h.b_wins}</span> {b}</span>
            </div>
            <p className="tnum mt-1 text-xs text-muted">
              {h2h.played} meetings · goals {h2h.goals_a}–{h2h.goals_b}
            </p>
            {h2h.recent.length ? (
              <ul className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                {h2h.recent.map((m, i) => (
                  <li key={i} className="flex items-center justify-between gap-3">
                    <span className="tnum shrink-0 text-muted">{m.date}</span>
                    <span className="min-w-0 flex-1 truncate text-center text-xs text-secondary capitalize">
                      {prettyComp(m.competition)}
                    </span>
                    <span className="tnum shrink-0 font-medium text-fg">
                      {m.a_score}–{m.b_score}
                      <span className="ml-2 font-normal text-muted">{m.winner ?? "draw"}</span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted">No previous meetings on record.</p>
        )}
      </Card>
    </div>
  );
}

/** One team's column in the Goals-and-cards card: its scorers, own goals conceded TO it (the other
 *  team's own_goals, marked OG), and its bookings. "none" when the team neither scored nor was booked. */
function ContribColumn({ team, own, otherOwnGoals }: {
  team: string;
  own: MatchPlayerLine[];
  otherOwnGoals: MatchPlayerLine[];
}) {
  const scorers = own.filter((p) => p.goals > 0);
  const ownGoalsForUs = otherOwnGoals.filter((p) => p.own_goals > 0);
  const booked = own.filter((p) => p.yellow > 0 || p.red > 0);
  const hasAny = scorers.length > 0 || ownGoalsForUs.length > 0 || booked.length > 0;
  return (
    <div className="min-w-0">
      <div className="truncate text-sm font-semibold text-fg">{team}</div>
      {!hasAny ? (
        <p className="mt-1 text-xs text-muted">none</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm text-secondary">
          {scorers.map((p) => (
            <li key={`g-${p.player_id}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="tnum shrink-0 text-fg">{p.goals > 1 ? `${p.goals} goals` : "goal"}</span>
            </li>
          ))}
          {ownGoalsForUs.map((p) => (
            <li key={`og-${p.player_id}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="shrink-0 text-muted">{p.own_goals > 1 ? `${p.own_goals} OG` : "OG"}</span>
            </li>
          ))}
          {booked.map((p) => (
            <li key={`c-${p.player_id}`} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate">{p.name}</span>
              <span className="shrink-0 space-x-1 whitespace-nowrap">
                {p.yellow > 0 ? <Tag variant="gold">{p.yellow > 1 ? `${p.yellow} YC` : "YC"}</Tag> : null}
                {p.red > 0 ? <Tag variant="down">RC</Tag> : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type StatKey = "possession" | "shots" | "shots_on_target" | "corners" | "fouls" | "offsides" | "yellow" | "red";
const STAT_ROWS: { label: string; key: StatKey; pct?: boolean }[] = [
  { label: "Possession", key: "possession", pct: true },
  { label: "Shots", key: "shots" },
  { label: "On target", key: "shots_on_target" },
  { label: "Corners", key: "corners" },
  { label: "Fouls", key: "fouls" },
  { label: "Offsides", key: "offsides" },
  { label: "Yellow cards", key: "yellow" },
  { label: "Red cards", key: "red" },
];

/** Wave 1.6 team match stats: a per-stat comparison of the two teams, each row a proportional split
 *  bar in the nations' flag colours. Display-only data (FotMob/ESPN); it never feeds the model. */
function TeamStatsCard({ teamA, teamB, stats }: {
  teamA: string;
  teamB: string;
  stats: NonNullable<MatchDetail["teamStats"]>;
}) {
  const a = stats.team_a, b = stats.team_b;
  const num = (r: MatchTeamStatLine | null, k: StatKey): number | null => {
    const v = r ? r[k] : null;
    return typeof v === "number" ? v : null;
  };
  const rows = STAT_ROWS.filter((row) => num(a, row.key) != null || num(b, row.key) != null);
  if (rows.length === 0) return null;
  const colA = flagColor(teamA), colB = flagColor(teamB);
  const src = (a?.source ?? b?.source ?? "").replace("auto:", "");
  const fmt = (v: number | null, isPct?: boolean) => (v == null ? "-" : isPct ? `${Math.round(v)}%` : `${v}`);
  return (
    <Card>
      <CardHeader title="Match stats" hint={src ? `from ${src}` : "team stats"} />
      <ul className="space-y-2.5">
        {rows.map((row) => {
          const va = num(a, row.key), vb = num(b, row.key);
          const sum = (va ?? 0) + (vb ?? 0);
          const fracA = sum > 0 ? (va ?? 0) / sum : 0.5;
          return (
            <li key={row.key}>
              <div className="tnum flex items-center justify-between gap-2 text-sm">
                <span className="w-12 shrink-0 font-semibold text-fg">{fmt(va, row.pct)}</span>
                <span className="min-w-0 flex-1 truncate text-center text-xs text-secondary">{row.label}</span>
                <span className="w-12 shrink-0 text-right font-semibold text-fg">{fmt(vb, row.pct)}</span>
              </div>
              <div className="mt-1 flex h-1.5 overflow-hidden rounded-full bg-elevated">
                <div style={{ width: `${fracA * 100}%`, background: colA }} />
                <div style={{ width: `${(1 - fracA) * 100}%`, background: colB }} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">Display only. Team stats never feed the model or the result.</p>
    </Card>
  );
}
