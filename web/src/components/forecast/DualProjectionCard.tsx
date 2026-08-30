import { Flag } from "@/components/ui/Flag";
import { flagColor } from "@/lib/flagColors";
import { cn, simPct } from "@/lib/utils";

// Below this absolute pp move the % is treated as unchanged (mirrors the leaderboard EPS).
const EPS = 0.0005;

/** A pre-tournament / live champion pick: the team and its champion probability. */
export interface ProjectionPick {
  team: string;
  champion: number;
}

function Half({
  kicker,
  pick,
}: {
  kicker: string;
  pick: ProjectionPick;
}) {
  // Per-pick share of field: the pick's own title probability, clamped to 0..1 and rendered as a
  // subtle bar fill. Computed WITHIN this pick's snapshot (never combined across the two halves -
  // there is no shared 100% and no draw here). The fill colour is the nation's dominant flag colour
  // (the sanctioned inline nation-colour exception); the track is a design-token grey.
  const sharePct = Math.max(0, Math.min(1, pick.champion)) * 100;

  return (
    <div className="flex flex-1 flex-col items-center gap-2 text-center">
      <span className="text-[10px] font-semibold tracking-wider text-muted uppercase">{kicker}</span>
      {/* A1: two flag sizes toggled by breakpoint. The .champion-flag-ring is UNLAYERED
          display:inline-flex in globals.css (the ring-hug fix), which beats Tailwind's layered
          display utilities - so the hidden/md:* toggle MUST live on an OUTER plain wrapper, never on
          the ring span itself (the ring's inline-flex would always win and the element would never
          hide). The display:none wrapper's ring measures 0x0 and passes the hug check vacuously. */}
      <span className="md:hidden">
        <span className="champion-flag-ring inline-block overflow-hidden rounded-[3px]">
          <Flag team={pick.team} size="text-2xl" className="block" link={false} />
        </span>
      </span>
      <span className="hidden md:block">
        <span className="champion-flag-ring inline-block overflow-hidden rounded-[3px]">
          <Flag team={pick.team} size="text-4xl" className="block" link={false} />
        </span>
      </span>
      <span className="font-display text-sm font-bold text-fg">{pick.team}</span>
      <span className="tnum font-display text-xl font-bold text-fg">{simPct(pick.champion)}</span>
      {/* A2: per-pick share-of-field bar. Token-grey track, nation-colour fill at the pick's title
          probability. Subtle, capped width, centered under the pick. */}
      <span
        data-share-bar
        className="block h-1.5 w-16 overflow-hidden rounded-full bg-border"
        aria-hidden
      >
        <span
          data-share-fill
          className="block h-full rounded-full"
          style={{ width: `${sharePct}%`, backgroundColor: flagColor(pick.team) }}
        />
      </span>
    </div>
  );
}

/** The RIGHT half once the tournament is SETTLED: the champion as a FACT, not a probability. The
 *  post-tournament "current pick" is the actual winner at ~100%, and printing that number (or its
 *  movement from the initial pick) is not information - the result already happened. So we render the
 *  outcome word, gold, with no percentage and no delta. */
function ResultHalf({ team }: { team: string }) {
  return (
    <div className="flex flex-1 flex-col items-center gap-2 text-center">
      <span className="text-[10px] font-semibold tracking-wider text-muted uppercase">Final result</span>
      <span className="md:hidden">
        <span className="champion-flag-ring inline-block overflow-hidden rounded-[3px]">
          <Flag team={team} size="text-2xl" className="block" link={false} />
        </span>
      </span>
      <span className="hidden md:block">
        <span className="champion-flag-ring inline-block overflow-hidden rounded-[3px]">
          <Flag team={team} size="text-4xl" className="block" link={false} />
        </span>
      </span>
      <span className="font-display text-sm font-bold text-fg">{team}</span>
      <span className="font-display text-xl font-bold text-gold-strong">Champions</span>
    </div>
  );
}

/** The LEFT-half degraded state when no cond0 (pre-tournament) pick exists: a visible "unavailable"
 *  framing, never a blank or gray box. Mirrors the model-competitor degraded state on /ai-vs-humans. */
function UnavailableHalf() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
      <span className="text-[10px] font-semibold tracking-wider text-muted uppercase">Initial pick</span>
      <span className="inline-block h-6 w-8 rounded-[3px] border border-dashed border-border" aria-hidden />
      <span className="text-xs font-medium text-secondary">Pre-tournament bracket unavailable</span>
    </div>
  );
}

/** DUAL PROJECTION CARD: one card, two halves. LEFT = the FROZEN cond0 pre-tournament pick (flag +
 *  country + initial champion%). RIGHT = the CURRENT live pick (flag + country + current champion%).
 *  The connecting element is the DELTA: the signed pp shift (green up / red down per the up/down
 *  tokens), plus, when the PICK itself moved to a different country, both flags/names stay visible so
 *  the move reads. When no cond0 pick exists the LEFT half degrades to a visible unavailable state and
 *  the RIGHT half still renders. Labels + numbers only - no prose. */
export function DualProjectionCard({
  initial,
  current,
  complete = false,
}: {
  /** The frozen cond0 pick, or null -> the LEFT half shows the visible unavailable state. */
  initial: ProjectionPick | null;
  current: ProjectionPick;
  /** Tournament SETTLED: the RIGHT half is the actual champion as a FACT, and the post-hoc delta
   *  (a probability moving toward a result that already happened) is dropped - it is not information. */
  complete?: boolean;
}) {
  const delta = initial ? current.champion - initial.champion : null;
  const moved = delta != null && Math.abs(delta) >= EPS;
  const up = moved && (delta as number) > 0;
  const pickChanged = !!initial && initial.team !== current.team;

  return (
    <div className="rounded-card border border-border bg-surface p-4 shadow-[var(--shadow-card)]">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="font-display text-sm font-semibold tracking-wide text-secondary uppercase">
          Champion pick
        </h3>
        <span className="text-xs text-muted">{complete ? "pre-tournament vs final result" : "initial vs current"}</span>
      </div>

      <div className="flex items-stretch gap-2">
        {initial ? <Half kicker="Initial pick" pick={initial} /> : <UnavailableHalf />}

        {/* connecting element. Live: the signed pp delta. Settled: a plain arrow - the movement of a
            probability toward an already-decided result is not information, so no number is shown. */}
        <div className="flex w-20 shrink-0 flex-col items-center justify-center gap-1">
          {complete ? (
            <span className="text-xs font-bold text-muted" aria-hidden>→</span>
          ) : moved ? (
            <span
              className={cn(
                "tnum rounded-full px-2 py-0.5 text-xs font-bold",
                up ? "bg-up-bg text-up" : "bg-down-bg text-down",
              )}
            >
              {up ? "+" : "−"}
              {(Math.abs(delta as number) * 100).toFixed(1)}%
            </span>
          ) : delta != null ? (
            <span className="tnum rounded-full px-2 py-0.5 text-xs font-bold text-muted">0.0%</span>
          ) : (
            <span className="text-xs font-bold text-muted">→</span>
          )}
          {!complete && pickChanged ? (
            <span className="text-[9px] font-semibold tracking-wide text-down uppercase">Pick moved</span>
          ) : null}
        </div>

        {complete ? <ResultHalf team={current.team} /> : <Half kicker="Current pick" pick={current} />}
      </div>
    </div>
  );
}
