import Link from "next/link";
import { Flag } from "@/components/ui/Flag";
import { teamCode } from "@/lib/teamCodes";
import { tint, segments } from "@/lib/bracketFill";
import { cn, simPct } from "@/lib/utils";
import type { BracketMatch } from "@/lib/types";

function Side({
  team,
  win,
  isWinner,
  isChamp,
}: {
  team: string | null;
  win: number | null;
  isWinner: boolean;
  isChamp: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {team ? (
        <Flag team={team} size="text-sm" link={false} />
      ) : (
        <span className="inline-block h-3 w-4 shrink-0 rounded-[2px] bg-elevated" />
      )}
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          isChamp ? "font-semibold text-gold-strong" : isWinner ? "font-semibold text-fg" : "text-secondary"
        )}
      >
        {team ?? "—"}
      </span>
      <span className={cn("tnum shrink-0", isWinner ? "font-semibold text-fg" : "text-muted")}>
        {simPct(win)}
      </span>
    </div>
  );
}

/** One bracket match - reuses the home match-card language (flag + team + W/D/L bar). Projected
 *  cells get a dashed border; the champion's path gets a solid gold ring + gold champion name.
 *  `fill` selects the win/draw indicator: "bar" (default) is the thin three-band bar between the two
 *  stacked Sides (full names); "nation" is the FULL-CELL nation-coloured three-way proportional fill
 *  behind two side-by-side team clusters - each a small TWO-ROW stack (flag + 3-letter code on top, that
 *  team's win % centred beneath in the primary fg colour): team A anchored LEFT, team B anchored RIGHT,
 *  the draw carried by the grey MIDDLE band of the fill (no centred number) so both clusters fit unclipped
 *  - mirroring the mobile BracketFlow card via the bracketFill helpers, opt-in only. */
export function BracketCell({
  m,
  champion,
  variant = "sm",
  fill = "bar",
}: {
  m?: BracketMatch;
  champion: string | null;
  variant?: "sm" | "final";
  fill?: "bar" | "nation";
}) {
  if (!m) {
    return <div className="rounded-md border border-dashed border-border bg-bg-subtle p-2" />;
  }
  const resolved = m.a_resolved && m.b_resolved; // a real, played-into fixture → clickable
  const projected = !resolved;
  const onPath = m.champion_path;
  const pa = m.p_a ?? 0, pd = m.p_draw ?? 0, pb = m.p_b ?? 0;
  const aWin = m.proj_winner != null && m.proj_winner === m.team_a;
  const bWin = m.proj_winner != null && m.proj_winner === m.team_b;
  const aChamp = onPath && champion === m.team_a;
  const bChamp = onPath && champion === m.team_b;
  const nation = fill === "nation";
  const [wa, wd, wb] = segments(m);

  const className = cn(
    "block rounded-md bg-bg-subtle shadow-[var(--shadow-card)]",
    nation && "relative overflow-hidden",
    // nation (forecast) cells are FULL cards: fatter padding, a real min-height, and a larger base
    // type so the single cluster row sits centred in a card rather than a thin strip. bar mode keeps
    // its original p-2/p-3 + text-[11px]/text-xs dimensions byte-identical.
    nation
      ? variant === "final"
        ? "px-3 py-4 min-h-[64px] min-w-[180px] text-sm"
        : "px-2 py-3 min-h-[56px] min-w-[168px] text-sm"
      : variant === "final"
        ? "p-3 text-xs"
        : "p-2 text-[11px]",
    onPath
      ? "border border-gold ring-1 ring-gold"
      : projected
        ? "border border-dashed border-border-strong"
        : "border border-border",
    resolved && "transition hover:border-border-strong hover:bg-elevated"
  );

  const inner = nation ? (
    <>
      {/* full-cell three-band nation fill behind the teams: team A colour | draw grey | team B
          colour, all low-alpha. The foreground cluster row sits OVER it via the relative z-10 layer -
          an absolutely-positioned background otherwise paints above non-positioned siblings. */}
      <div aria-hidden data-cell-fill="nation" className="absolute inset-0 flex">
        <span data-seg="a" style={{ width: `${wa}%`, backgroundColor: tint(m.team_a) }} />
        <span data-seg="draw" style={{ width: `${wd}%`, backgroundColor: tint(null) }} />
        <span data-seg="b" style={{ width: `${wb}%`, backgroundColor: tint(m.team_b) }} />
      </div>
      {/* foreground: two team clusters, each a small TWO-ROW stack - flag + 3-letter CODE identity on
          top, that team's win % centred BENEATH it in the primary fg colour (text-fg, readable on the
          low-alpha tint across all themes). Team A anchored LEFT, team B anchored RIGHT (justify-between).
          Moving the % below the flag narrows each cluster to ~flag+code wide, which (with the draw carried
          by the grey MIDDLE band, no centred number) keeps both clusters fully inside the rounded
          overflow-hidden cell - neither team's flag/code is clipped. */}
      <div className="relative z-10 flex min-h-[2.5rem] items-center justify-between gap-1">
        <span data-team="a" className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="flex items-center gap-0.5">
            <Flag team={m.team_a ?? ""} size="text-sm" link={false} />
            <span className={cn("font-display text-sm font-bold", aChamp ? "text-gold-strong" : aWin ? "text-fg" : "text-secondary")}>
              {m.team_a ? teamCode(m.team_a) : "—"}
            </span>
          </span>
          <span className="tnum shrink-0 text-[10px] font-semibold text-fg">{simPct(m.p_a, 0)}</span>
        </span>
        <span data-team="b" className="flex shrink-0 flex-col items-center gap-0.5">
          <span className="flex items-center gap-0.5">
            <span className={cn("font-display text-sm font-bold", bChamp ? "text-gold-strong" : bWin ? "text-fg" : "text-secondary")}>
              {m.team_b ? teamCode(m.team_b) : "—"}
            </span>
            <Flag team={m.team_b ?? ""} size="text-sm" link={false} />
          </span>
          <span className="tnum shrink-0 text-[10px] font-semibold text-fg">{simPct(m.p_b, 0)}</span>
        </span>
      </div>
    </>
  ) : (
    <>
      <Side team={m.team_a} win={m.p_a} isWinner={aWin} isChamp={onPath && champion === m.team_a} />
      <div className="my-1.5 flex h-1.5 overflow-hidden rounded-full bg-elevated">
        <div className={aWin ? "bg-confident" : "bg-border-strong"} style={{ width: `${pa * 100}%` }} />
        <div className="bg-neutral" style={{ width: `${pd * 100}%` }} />
        <div className={bWin ? "bg-confident" : "bg-border-strong"} style={{ width: `${pb * 100}%` }} />
      </div>
      <Side team={m.team_b} win={m.p_b} isWinner={bWin} isChamp={onPath && champion === m.team_b} />
    </>
  );

  // Clickable only once the slot resolves into a real fixture; projected cells are inert.
  return resolved ? (
    <Link href={`/match/${m.match_id}`} className={className}>{inner}</Link>
  ) : (
    <div className={className}>{inner}</div>
  );
}
