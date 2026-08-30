"use client";

import { useState } from "react";
import Link from "next/link";
import { BracketNote } from "@/components/bracket/BracketNote";
import { Flag } from "@/components/ui/Flag";
import { LaurelCup } from "@/components/brand/marks";
import { teamCode } from "@/lib/teamCodes";
import { tint, segments } from "@/lib/bracketFill";
import { cn, simPct } from "@/lib/utils";
import type { BracketMatch, ProjectedBracket } from "@/lib/types";

// The knockout rounds, top to bottom. The Final is rendered as its own terminal round just above the
// champion node; the third-place playoff is NOT given its own round card (it is a side fixture off the
// SF losers, not part of the champion path) - a deliberate omission, flagged in the report.
const ROUNDS: { stage: string; label: string; cols: 1 | 2 }[] = [
  { stage: "round_of_32", label: "Round of 32", cols: 2 },
  { stage: "round_of_16", label: "Round of 16", cols: 2 },
  { stage: "quarter_finals", label: "Quarter-finals", cols: 2 },
  { stage: "semi_finals", label: "Semi-finals", cols: 2 },
  { stage: "final", label: "Final", cols: 1 },
];

const SHORT: Record<string, string> = {
  round_of_32: "R32",
  round_of_16: "R16",
  quarter_finals: "QF",
  semi_finals: "SF",
  final: "Final",
};

/** One match card: a three-segment proportional background (team A colour | draw grey | team B colour,
 *  all low-alpha) with the foreground laid out LEFT to RIGHT - team A anchored left, the draw centred,
 *  team B anchored right. Projected (unresolved) slots get the dashed "projected slot" treatment;
 *  resolved matches link to the match page (mirroring BracketCell). */
function MatchCard({ m, champion }: { m?: BracketMatch; champion: string | null }) {
  if (!m) {
    return (
      <div
        data-match-card
        className="rounded-md border border-dashed border-border bg-bg-subtle p-2"
      />
    );
  }
  const resolved = m.a_resolved && m.b_resolved;
  const projected = !resolved;
  const onPath = m.champion_path;
  const [wa, wd, wb] = segments(m);
  const aWin = m.proj_winner != null && m.proj_winner === m.team_a;
  const bWin = m.proj_winner != null && m.proj_winner === m.team_b;
  const aChamp = onPath && champion != null && champion === m.team_a;
  const bChamp = onPath && champion != null && champion === m.team_b;

  const className = cn(
    "relative block overflow-hidden rounded-md bg-bg-subtle p-2 shadow-[var(--shadow-card)]",
    onPath
      ? "border border-gold ring-1 ring-gold"
      : projected
        ? "border border-dashed border-border-strong"
        : "border border-border",
    resolved && "transition hover:border-border-strong",
  );

  const inner = (
    <>
      {/* proportional background: three horizontal segments at p_a : p_draw : p_b, low alpha so the
          foreground text stays readable. Team colours on the OUTSIDE, neutral grey in the MIDDLE. */}
      <div aria-hidden data-card-bg className="absolute inset-0 flex">
        <span data-seg="a" style={{ width: `${wa}%`, backgroundColor: tint(m.team_a) }} />
        <span data-seg="draw" style={{ width: `${wd}%`, backgroundColor: tint(null) }} />
        <span data-seg="b" style={{ width: `${wb}%`, backgroundColor: tint(m.team_b) }} />
      </div>

      {/* foreground: team A on the LEFT over its segment, the draw % centred, team B on the RIGHT.
          Never stacked - team A's content always sits to the left of team B's content. */}
      <div className="relative flex items-center justify-between gap-1.5">
        <span data-team="a" className="flex min-w-0 items-center gap-1">
          <Flag team={m.team_a ?? ""} size="text-xs" link={false} />
          <span
            className={cn(
              "font-display text-[11px] font-bold",
              aChamp ? "text-gold-strong" : aWin ? "text-fg" : "text-secondary",
            )}
          >
            {m.team_a ? teamCode(m.team_a) : "—"}
          </span>
          <span className="tnum text-[10px] font-semibold text-muted">{simPct(m.p_a, 0)}</span>
        </span>

        <span data-draw className="tnum shrink-0 text-[9px] font-medium text-muted">
          {simPct(m.p_draw, 0)}
        </span>

        <span data-team="b" className="flex min-w-0 items-center justify-end gap-1">
          <span className="tnum text-[10px] font-semibold text-muted">{simPct(m.p_b, 0)}</span>
          <span
            className={cn(
              "font-display text-[11px] font-bold",
              bChamp ? "text-gold-strong" : bWin ? "text-fg" : "text-secondary",
            )}
          >
            {m.team_b ? teamCode(m.team_b) : "—"}
          </span>
          <Flag team={m.team_b ?? ""} size="text-xs" link={false} />
        </span>
      </div>
    </>
  );

  // Clickable only once the slot resolves into a real fixture (mirrors BracketCell); projected cells
  // are inert. The projected bracket carries no actual scoreline, so none is invented here.
  return resolved ? (
    <Link href={`/match/${m.match_id}`} className={className}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}

/** A vertical ASCII flow connector between rounds: a short spine plus an ASCII "v" arrowhead (the
 *  no-em-dash/ASCII-arrow rule - the same "v" the funnel used). */
function FlowArrow() {
  return (
    <div aria-hidden data-flow-arrow className="flex flex-col items-center py-1.5">
      <span className="block h-3 w-px bg-border-strong" />
      <span className="-mt-1 font-display text-xs leading-none text-border-strong">v</span>
    </div>
  );
}

/** One collapsible round card. COLLAPSED (default) shows the round label, the match count, and a
 *  PREDICTED-WINNERS flag strip (the proj_winner of each match as uniform flags). EXPANDED reveals the
 *  round's matches in a two-column grid. The toggle is a real <button aria-expanded> so it is
 *  keyboard-accessible and renders server-side (collapsed) before hydration. */
export function RoundCard({
  label,
  short,
  matches,
  champion,
  cols,
  defaultOpen = false,
}: {
  label: string;
  short: string;
  matches: BracketMatch[];
  champion: string | null;
  cols: 1 | 2;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // predicted winners (the proj_winner of each match) - the live reality mid-tournament is that most
  // knockout slots are still PROJECTED, so this strip is the projected advancement, not actual.
  const winners = matches.map((m) => m.proj_winner).filter((w): w is string => !!w);

  return (
    <div
      data-round={short}
      className="overflow-hidden rounded-card border border-border bg-surface shadow-[var(--shadow-card)]"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full flex-col gap-2 px-3 py-2.5 text-left transition hover:bg-elevated"
      >
        {/* line 1: round label + match count + the collapse caret. */}
        <span className="flex w-full items-center gap-3">
          <span className="flex shrink-0 items-baseline gap-2">
            <span className="font-display text-sm font-bold tracking-wide text-fg">{short}</span>
            <span className="text-[10px] font-medium tracking-wider text-muted uppercase">{label}</span>
          </span>
          <span className="tnum shrink-0 text-[10px] font-medium text-muted">
            {matches.length} {matches.length === 1 ? "match" : "matches"}
          </span>

          {/* a small ASCII caret conveying collapsed/expanded state (pushed to the row's end). */}
          <span
            aria-hidden
            className={cn(
              "ml-auto shrink-0 font-display text-xs leading-none text-muted transition-transform",
              open ? "rotate-180" : "",
            )}
          >
            v
          </span>
        </span>

        {/* line 2: predicted-winners as a CLEAN GRID - one uniform flag box per match's projected
            winner, laid into fixed 1rem (= the text-xs flag box) columns with a token gap so the flags
            align both ACROSS (beside) and DOWN (under) on a consistent baseline. Replaces the old
            flex-wrap justify-end strip whose short last row sat ragged/right-shifted out of column. */}
        <span
          data-winner-strip
          className="grid w-full gap-1 [grid-template-columns:repeat(auto-fill,1rem)]"
        >
          {winners.map((w, i) => (
            <Flag key={`${w}-${i}`} team={w} size="text-xs" link={false} />
          ))}
        </span>
      </button>

      {open ? (
        <div
          data-round-grid
          className={cn("gap-2 p-3 pt-0", cols === 2 ? "grid grid-cols-2" : "grid grid-cols-1")}
        >
          {matches.map((m) => (
            <MatchCard key={m.match_id} m={m} champion={champion} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The terminal CHAMPION NODE. LIVE: amber/gold emphasis, the champion flag in the shared
 *  `.champion-flag-ring`, the country name, and the modal-bracket title probability with a "to win"
 *  qualifier (pulled from the Final match's champion side; omitted, never fabricated, when not cleanly
 *  derivable). SETTLED (`settled`): the champion is a FACT - the laurel/eyebrow reads "Champion" and the
 *  title % + "to win" is DROPPED, because a probability moving toward an already-decided result is not
 *  information (the same category fix F4 applied to DualProjectionCard's ResultHalf). */
function ChampionNode({
  champion,
  titlePct,
  settled = false,
}: {
  champion: string;
  titlePct: number | null;
  settled?: boolean;
}) {
  return (
    <div
      data-champion-node
      data-champion-settled={settled ? "" : undefined}
      className="champion-surface flex items-center gap-3 rounded-card border px-4 py-3"
    >
      <LaurelCup size={28} title={settled ? "Champion" : "Projected champion"} className="shrink-0 text-gold" />
      <span className="champion-flag-ring inline-block shrink-0 overflow-hidden rounded-[3px]">
        <Flag team={champion} size="text-xl" className="block" link={false} />
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="font-display text-base font-bold text-fg">{champion}</div>
        <div className="text-[10px] font-semibold tracking-wider text-gold-strong uppercase">
          Champion
        </div>
      </div>
      {/* SETTLED: no percentage beside the decided champion (a probability toward a fact is not
          information). LIVE: the modal-bracket title % with its "to win" qualifier. */}
      {settled ? null : titlePct != null ? (
        <span className="flex shrink-0 items-baseline gap-1">
          <span className="tnum font-display text-2xl font-bold text-gold-strong">{simPct(titlePct)}</span>
          <span className="text-[10px] font-medium tracking-wide text-muted uppercase">to win</span>
        </span>
      ) : (
        <span className="text-[10px] font-medium tracking-wide text-muted uppercase">to win</span>
      )}
    </div>
  );
}

/** BRACKET FLOW: a single vertical, collapsible flowchart of the whole projected knockout bracket,
 *  top to bottom (R32 -> R16 -> QF -> SF -> Final -> Champion). One collapsible card per round
 *  (collapsed by default), ASCII flow arrows between rounds, and a terminal champion node. Mobile-first,
 *  correct at 390px. Replaces the tabbed mobile bracket + survival funnel; no round tab bar, no
 *  standalone projected-champion banner. */
export function BracketFlow({
  bracket,
  championSettled = false,
}: {
  bracket: ProjectedBracket;
  /** Tournament SETTLED and this is the CURRENT (actual) bracket: the champion node reads as a fact,
   *  no title % / "to win". The pre-tournament (initial) bracket stays a projection even when settled. */
  championSettled?: boolean;
}) {
  const { matches, champion } = bracket;
  const all = Object.values(matches);
  const byStage = (s: string) =>
    all.filter((m) => m.stage === s).sort((a, b) => a.match_no - b.match_no);

  // title % from the Final match's champion side: p_a when the champion is team_a, p_b when team_b.
  // Omitted (null) when the Final or the champion side is not cleanly resolvable - never fabricated.
  const fin = matches["M104"];
  let titlePct: number | null = null;
  if (fin && champion != null) {
    if (fin.team_a === champion) titlePct = fin.p_a ?? null;
    else if (fin.team_b === champion) titlePct = fin.p_b ?? null;
  }

  return (
    <div className="w-full max-w-full">
      <h2 className="font-display text-xl font-bold text-fg">Projected Bracket</h2>
      <p className="mb-4 text-sm text-secondary">
        The model&apos;s most-likely knockout path, R32 to the title.
      </p>

      <div className="flex flex-col">
        {ROUNDS.map((r) => {
          const roundMatches = byStage(r.stage);
          if (roundMatches.length === 0) return null;
          return (
            <div key={r.stage}>
              <RoundCard
                label={r.label}
                short={SHORT[r.stage]}
                matches={roundMatches}
                champion={champion}
                cols={r.cols}
              />
              <FlowArrow />
            </div>
          );
        })}

        {champion ? (
          <ChampionNode champion={champion} titlePct={titlePct} settled={championSettled} />
        ) : (
          <p className="text-sm text-secondary">No projected champion yet.</p>
        )}
      </div>

      <BracketNote />
    </div>
  );
}
