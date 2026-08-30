import Link from "next/link";
import { Flag } from "@/components/ui/Flag";
import { LocalKickoff } from "@/components/ui/LocalKickoff";
import { teamCode } from "@/lib/teamCodes";
import { cn, simPct } from "@/lib/utils";
import type { UpcomingMatch } from "@/lib/types";

// ── Shared glance sub-pieces ──────────────────────────────────────────────────
// The visual language of the at-a-glance tile is defined ONCE here and reused by every compact
// fixture tile (the home upcoming grid via MatchGlanceTile, the /matches list via FixtureGlanceTile)
// so the two surfaces stay in lockstep and never drift. Each piece is phone-first compact.

/** A team chip: flag + short label (FIFA trigram for a resolved country, a readable slot label for
 *  an undetermined knockout slot). `align` mirrors the chip for the right-hand side. The favoured
 *  side reads bold; everything else is the calm default. */
export function GlanceTeam({
  team,
  label,
  fav = false,
  align = "left",
}: {
  /** Resolved country name (drives flag + trigram), or null for an undetermined knockout slot. */
  team: string | null;
  /** Override label (e.g. a readable knockout slot when `team` is null). */
  label?: string;
  fav?: boolean;
  align?: "left" | "right";
}) {
  const text = team ? teamCode(team) : label ?? "TBC";
  const right = align === "right";
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5", right && "justify-end")}>
      {!right && team ? <Flag team={team} size="text-lg" link={false} /> : null}
      <span
        className={cn(
          "tnum truncate text-sm",
          right && "text-right",
          fav ? "font-semibold text-fg" : team ? "font-semibold text-fg" : "text-secondary",
        )}
      >
        {text}
      </span>
      {right && team ? <Flag team={team} size="text-lg" link={false} /> : null}
    </span>
  );
}

/** The thin three-segment win / draw / loss bar. The favoured side's segment reads electric-blue;
 *  the other two read muted (a hair's margin = no clear favourite, neither side highlighted). */
export function GlanceBar({
  favA,
  favB,
  pa,
  pd,
  pb,
}: {
  favA: boolean;
  favB: boolean;
  pa: number;
  pd: number;
  pb: number;
}) {
  return (
    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-elevated" aria-hidden>
      <div className={favA ? "bg-confident" : "bg-border-strong"} style={{ width: `${pa * 100}%` }} />
      <div className="bg-neutral" style={{ width: `${pd * 100}%` }} />
      <div className={favB ? "bg-confident" : "bg-border-strong"} style={{ width: `${pb * 100}%` }} />
    </div>
  );
}

/** The single glance number: the favoured side's win chance (trigram + %), or "Even %" on a
 *  toss-up. Returns null when no run is published. */
export function GlanceFavLine({ favName, favPct }: { favName: string | null; favPct: number | null }) {
  return (
    <p className="tnum mt-1 truncate text-[11px] text-secondary">
      {favName ? (
        <>
          <span className="font-semibold text-confident">{favName}</span> {simPct(favPct)}
        </>
      ) : (
        <span className="font-medium">Even {simPct(favPct)}</span>
      )}
    </p>
  );
}

/** The split of model odds into "who is favoured" used identically by every glance tile: a margin
 *  under 5 points reads as no clear favourite (neither side highlighted, "Even"). */
export function favoredSplit(
  pa: number,
  pb: number,
  hasProbs: boolean,
  teamA: string | null,
  teamB: string | null,
): { favA: boolean; favB: boolean; favName: string | null } {
  const margin = Math.abs(pa - pb);
  const favA = hasProbs && margin >= 0.05 && pa > pb;
  const favB = hasProbs && margin >= 0.05 && pb > pa;
  const favName = favA && teamA ? teamCode(teamA) : favB && teamB ? teamCode(teamB) : null;
  return { favA, favB, favName };
}

/** The single, shared at-a-glance match tile. The GLANCE SET only: kickoff (local), both teams
 *  (flag + short name), the thin win/draw/loss bar, and the favored side's win %. Nothing else.
 *
 *  Everything that used to crowd the home tile (the why-favored tag + sentence, the expected-goals
 *  line, the two recent-form chip rows) already lives on /match/[id] (MatchBody), so it is NOT
 *  duplicated here. The whole tile is ONE Link tap target into the match detail. Factored out so the
 *  homepage upcoming grid and any other at-a-glance list of upcoming fixtures stay in lockstep and
 *  never drift.
 *
 *  Phone-first compact: short team labels (FIFA trigram) so a name never truncates into ambiguity at
 *  two-up width on a ~390px phone, a comfortable >=44px tap height, and tight vertical rhythm. */
export function MatchGlanceTile({ m }: { m: UpcomingMatch }) {
  const p = m.probs;
  const pa = p?.p_team_a_win ?? 0;
  const pd = p?.p_draw ?? 0;
  const pb = p?.p_team_b_win ?? 0;
  const hasProbs = Boolean(p);

  // Favored side from the model split; a hair's margin reads as no clear favorite (neither bar
  // segment highlighted), exactly like the /matches row + the match detail bar.
  const { favA, favB, favName } = favoredSplit(pa, pb, hasProbs, m.team_a, m.team_b);
  const favPct = hasProbs ? Math.max(pa, pb) : null;

  return (
    <Link
      href={`/match/${m.match_id}`}
      className="flex min-h-[44px] min-w-0 flex-col justify-center rounded-md border border-border bg-bg-subtle p-2.5 transition hover:border-border-strong hover:bg-elevated"
    >
      {/* kickoff (local) */}
      <LocalKickoff iso={m.kickoff_utc} className="tnum block truncate text-[11px] text-muted" />

      {/* teams: flag + short name on each side */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <GlanceTeam team={m.team_a} fav={favA} align="left" />
        <span className="shrink-0 text-[10px] font-medium text-muted">vs</span>
        <GlanceTeam team={m.team_b} fav={favB} align="right" />
      </div>

      {/* thin win / draw / loss bar */}
      <GlanceBar favA={favA} favB={favB} pa={pa} pd={pd} pb={pb} />

      {/* favored side's win % (the single glance number; toss-ups read as "Even") */}
      {hasProbs ? <GlanceFavLine favName={favName} favPct={favPct} /> : null}
    </Link>
  );
}
