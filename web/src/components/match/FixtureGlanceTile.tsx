import Link from "next/link";
import {
  GlanceTeam,
  GlanceBar,
  GlanceFavLine,
  favoredSplit,
} from "@/components/match/MatchGlanceTile";
import { LocalKickoff } from "@/components/ui/LocalKickoff";
import { teamCode } from "@/lib/teamCodes";
import type { DailyFixture } from "@/lib/data/daily";

// Render a bracket slot code as a SHORT readable label for the compact tile (no slot codes in the
// UI, per the design lock). Group placements: 1X/2X/3X -> Winner/Runner-up/3rd, Group X. Best-third
// and knockout references stay short so they fit a two-up tile at ~390px without truncating into
// ambiguity. Matches DailyMatchRow's semantics, trimmed for the tile.
function slotLabel(code: string | null): string {
  if (!code) return "TBC";
  const placing = /^([123])([A-L])$/.exec(code);
  if (placing) {
    const [, rank, group] = placing;
    const word = rank === "1" ? "Winner" : rank === "2" ? "Runner-up" : "3rd";
    return `${word} ${group}`;
  }
  const best3 = /^best3_of_([A-L]+)$/.exec(code);
  if (best3) return `Best 3rd`;
  const prog = /^([WL])(\d+)$/.exec(code);
  if (prog) return `${prog[1] === "W" ? "Win" : "Lose"} M${prog[2]}`;
  return code;
}

/** The compact at-a-glance tile for the /matches list. Shares the GLANCE visual language with
 *  MatchGlanceTile (same team chips, same thin win/draw/loss bar, same fav line) but accepts the
 *  full DailyFixture range the /matches page needs:
 *    • resolved teams (flag + trigram): upcoming (kickoff + bar + fav%) OR finished (score + FT);
 *    • undetermined knockout slots (readable short labels, never a slot code, never a broken flag).
 *
 *  The whole tile is ONE Link tap target into /match/[id] WHEN the matchup is resolved (a real
 *  detail page exists). An undetermined knockout slot has no detail page, so it renders as a
 *  non-link compact placeholder tile, never a dead-end tap. The heavy row content (full odds
 *  blocks, venue, stage tags) lives one tap away on /match/[id], not here. */
export function FixtureGlanceTile({ fixture: m }: { fixture: DailyFixture }) {
  const known = Boolean(m.team_a && m.team_b);
  const aLabel = slotLabel(m.team_a_slot);
  const bLabel = slotLabel(m.team_b_slot);

  const p = m.probs;
  const pa = p?.p_team_a_win ?? 0;
  const pd = p?.p_draw ?? 0;
  const pb = p?.p_team_b_win ?? 0;
  const hasProbs = Boolean(p);

  const { favA, favB, favName } = favoredSplit(pa, pb, hasProbs, m.team_a, m.team_b);
  const favPct = hasProbs ? Math.max(pa, pb) : null;
  const finished = m.finished && m.result != null;

  const inner = (
    <>
      {/* kickoff (local); FT marker on a finished match keeps the score read unambiguous */}
      <span className="flex items-center justify-between gap-2 text-[11px] text-muted">
        <LocalKickoff iso={m.kickoff_utc} className="tnum block truncate" />
        {finished ? <span className="tnum shrink-0 font-semibold text-secondary">FT</span> : null}
      </span>

      {/* teams: flag + trigram for resolved sides; readable short labels for undetermined slots */}
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <GlanceTeam team={m.team_a} label={aLabel} fav={favA} align="left" />
        <span className="shrink-0 text-[10px] font-medium text-muted">vs</span>
        <GlanceTeam team={m.team_b} label={bLabel} fav={favB} align="right" />
      </div>

      {/* glance line: a recorded score, the win/draw/loss bar + fav%, or a quiet "Scheduled" */}
      {finished && m.result ? (
        <div className="mt-2 text-center">
          <p className="tnum text-sm font-semibold text-fg">
            {m.result.a}-{m.result.b}
          </p>
          {/* Shootout (Wave 1.7): a level knockout decided on penalties shows the compact pens
              grammar - "4-3 pens, MAR advance" - with the tally once captured, the advancer trigram
              always. Non-shootout results just show the score above. */}
          {m.winnerTeam && m.result.a === m.result.b ? (
            <p className="tnum truncate text-[10px] text-secondary">
              {m.pens ? `${m.pens.a}-${m.pens.b} pens, ` : "pens, "}
              <span className="font-semibold text-fg">{teamCode(m.winnerTeam)}</span> advance
            </p>
          ) : null}
        </div>
      ) : hasProbs ? (
        <>
          <GlanceBar favA={favA} favB={favB} pa={pa} pd={pd} pb={pb} />
          <GlanceFavLine favName={favName} favPct={favPct} />
        </>
      ) : (
        <p className="mt-2 truncate text-[11px] text-muted">
          {known ? "Scheduled" : "Awaiting teams"}
        </p>
      )}
    </>
  );

  const box =
    "flex min-h-[44px] min-w-0 flex-col justify-center rounded-md border border-border bg-bg-subtle p-2.5 transition";

  // Resolved matchup -> one tap to the detail page. Undetermined slot -> a non-link placeholder
  // tile (no dead-end tap): same compact shape, just not clickable.
  if (known) {
    return (
      <Link href={`/match/${m.match_id}`} className={`${box} hover:border-border-strong hover:bg-elevated`}>
        {inner}
      </Link>
    );
  }
  return <div className={box}>{inner}</div>;
}
