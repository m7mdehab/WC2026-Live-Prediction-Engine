import { Flag } from "@/components/ui/Flag";
import { LocalKickoff } from "@/components/ui/LocalKickoff";
import { simPct } from "@/lib/utils";
import type { NextMatchCard, NextMatchTeam } from "@/lib/data/nextMatch";

// Form-chip palette (mirrors FormChips): win up, draw neutral, loss down. Tokens only, no raw hex.
const CHIP: Record<"W" | "D" | "L", string> = {
  W: "bg-up-bg text-up",
  D: "bg-elevated text-secondary",
  L: "bg-down-bg text-down",
};

function FormRow({ form }: { form: ("W" | "D" | "L")[] }) {
  if (form.length === 0) {
    return <span className="text-[10px] text-muted">no recent form</span>;
  }
  return (
    <span className="flex gap-1">
      {form.map((r, i) => (
        <span
          key={i}
          className={`grid h-3.5 w-3.5 place-items-center rounded-[3px] text-[8px] font-bold ${CHIP[r]}`}
          aria-label={r === "W" ? "win" : r === "D" ? "draw" : "loss"}
        >
          {r}
        </span>
      ))}
    </span>
  );
}

/** One team's compact stat block: FIFA rank + Elo (tabular-nums) and the recent-form chips. */
function StatBlock({ t, align }: { t: NextMatchTeam; align: "left" | "right" }) {
  const right = align === "right";
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${right ? "items-end text-right" : "items-start text-left"}`}>
      <span className="tnum text-[11px] text-secondary">
        {t.fifaRank != null ? <>FIFA #{t.fifaRank}</> : "FIFA rank n/a"}
        {t.elo != null ? <span className="text-muted"> · Elo {t.elo}</span> : null}
      </span>
      <FormRow form={t.form} />
    </div>
  );
}

/**
 * The "next match" body under the shared countdown digits: the two nations, the model's current W/D/L
 * odds for the fixture, a compact stat line each, and a labeled editorial fact per nation. Purely
 * presentational (no state, no ticking) so it never causes layout shift. Every sub-section is fail-soft:
 * absent odds hide the bar; absent form/rank degrade in place; a nation with no curated fact omits its
 * line. The whole card is only mounted when a real next match exists (the hero owns that gate).
 */
export function NextMatchView({ card }: { card: NextMatchCard }) {
  const { teamA, teamB, pA, pDraw, pB } = card;
  const hasOdds = pA != null && pDraw != null && pB != null;
  const favA = hasOdds && (pA as number) > (pB as number);
  const favB = hasOdds && (pB as number) > (pA as number);
  const venue = [card.city, card.country].filter(Boolean).join(", ");

  return (
    <div data-hero-next className="mx-auto mt-4 max-w-md text-left">
      {/* kickoff + venue, compact */}
      <div className="flex items-center justify-center gap-2 text-[11px] text-muted">
        <LocalKickoff iso={card.kickoffUtc} className="tnum" timeOnly />
        {venue ? <span className="truncate">· {venue}</span> : null}
      </div>

      {/* teams facing off */}
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Flag team={teamA.name} size="text-2xl" />
          <span className="truncate text-sm font-semibold text-fg">{teamA.name}</span>
        </div>
        <span className="shrink-0 text-[11px] font-medium text-muted">vs</span>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-right text-sm font-semibold text-fg">{teamB.name}</span>
          <Flag team={teamB.name} size="text-2xl" />
        </div>
      </div>

      {/* current model odds (match_probabilities, latest run) */}
      {hasOdds ? (
        <div className="mt-3">
          <div className="flex h-2 overflow-hidden rounded-full bg-elevated">
            <div className={favA ? "bg-confident" : "bg-border-strong"} style={{ width: `${(pA as number) * 100}%` }} />
            <div className="bg-neutral" style={{ width: `${(pDraw as number) * 100}%` }} />
            <div className={favB ? "bg-confident" : "bg-border-strong"} style={{ width: `${(pB as number) * 100}%` }} />
          </div>
          <div className="tnum mt-1.5 flex justify-between text-[11px] text-secondary">
            <span className={favA ? "font-semibold text-confident" : ""}>{simPct(pA)} win</span>
            <span>{simPct(pDraw)} draw</span>
            <span className={favB ? "font-semibold text-confident" : ""}>{simPct(pB)} win</span>
          </div>
        </div>
      ) : (
        <p className="mt-3 text-center text-[11px] text-muted">Model odds pending for this match.</p>
      )}

      {/* compact stat line each */}
      <div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3">
        <StatBlock t={teamA} align="left" />
        <StatBlock t={teamB} align="right" />
      </div>

      {/* labeled editorial facts (curated, in-repo; not live data) */}
      {(teamA.fact || teamB.fact) ? (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-[9px] font-semibold tracking-widest text-muted uppercase">Editorial note</p>
          <ul className="mt-1.5 space-y-1.5">
            {teamA.fact ? (
              <li className="flex items-start gap-2">
                <Flag team={teamA.name} size="text-sm" className="mt-0.5" />
                <span className="text-[11px] leading-relaxed text-secondary">{teamA.fact}</span>
              </li>
            ) : null}
            {teamB.fact ? (
              <li className="flex items-start gap-2">
                <Flag team={teamB.name} size="text-sm" className="mt-0.5" />
                <span className="text-[11px] leading-relaxed text-secondary">{teamB.fact}</span>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
