import Link from "next/link";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { LocalKickoff } from "@/components/ui/LocalKickoff";
import { teamCode } from "@/lib/teamCodes";
import { cn, simPct } from "@/lib/utils";
import { stageLabel } from "@/lib/stage";
import type { DailyFixture } from "@/lib/data/daily";

// Render a bracket slot code as readable English (no slot codes in the UI, per the design lock).
// Group placements: 1X/2X/3X → Winner/Runner-up/3rd of Group X; best3_of_… → best third place.
// Knockout references: Wnn / Lnn → Winner / Loser of Match nn.
function slotLabel(code: string | null): string {
  if (!code) return "To be confirmed";
  const placing = /^([123])([A-L])$/.exec(code);
  if (placing) {
    const [, rank, group] = placing;
    const word = rank === "1" ? "Winner" : rank === "2" ? "Runner-up" : "3rd place";
    return `${word}, Group ${group}`;
  }
  const best3 = /^best3_of_([A-L]+)$/.exec(code);
  if (best3) return `Best 3rd (Groups ${best3[1].split("").join("/")})`;
  const prog = /^([WL])(\d+)$/.exec(code);
  if (prog) return `${prog[1] === "W" ? "Winner" : "Loser"} of Match ${prog[2]}`;
  return code;
}

/** A 3-way win / draw / win probability bar - identical styling to the /matches row (electric-blue
 *  favourite vs muted underdog; neither highlighted on a toss-up) so the app reads as one design. */
function ProbBar({ aFav, bFav, pa, pd, pb }: { aFav: boolean; bFav: boolean; pa: number; pd: number; pb: number }) {
  return (
    <div className="flex h-1.5 overflow-hidden rounded-full bg-elevated" aria-hidden>
      <div className={aFav ? "bg-confident" : "bg-border-strong"} style={{ width: `${pa * 100}%` }} />
      <div className="bg-neutral" style={{ width: `${pd * 100}%` }} />
      <div className={bFav ? "bg-confident" : "bg-border-strong"} style={{ width: `${pb * 100}%` }} />
    </div>
  );
}

/** One scheduled fixture, rendered as the briefing's factual skeleton: venue-local kickoff, the
 *  matchup (real teams, or readable bracket slots for undetermined knockout games), the model's
 *  current odds when a run is published, and stage/group context. Group fixtures with known teams
 *  deep-link to the full /match breakdown; undetermined knockout slots don't (no page yet). */
export function DailyMatchRow({ fixture: m }: { fixture: DailyFixture }) {
  const known = Boolean(m.team_a && m.team_b);
  const aName = m.team_a ?? slotLabel(m.team_a_slot);
  const bName = m.team_b ?? slotLabel(m.team_b_slot);

  const pa = m.probs?.p_team_a_win ?? null;
  const pd = m.probs?.p_draw ?? null;
  const pb = m.probs?.p_team_b_win ?? null;
  const hasProbs = pa != null && pd != null && pb != null;
  const aFav = hasProbs && pa! > pb!;
  const bFav = hasProbs && pb! > pa!;
  const favPct = hasProbs ? Math.max(pa!, pb!) : null;

  const stageTag =
    m.stage === "group" && m.group_code ? `Group ${m.group_code}` : stageLabel(m.stage);
  const completed = m.finished;

  const inner = (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-subtle px-3 py-2.5 transition group-hover:border-border-strong">
      {/* meta line: kickoff + venue + stage */}
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
        <span className="flex min-w-0 items-center gap-1.5">
          <LocalKickoff iso={m.kickoff_utc} className="tnum shrink-0" />
          {m.city ? <span className="truncate">· {m.city}</span> : null}
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {completed ? <Tag variant="neutral">Final</Tag> : null}
          <Tag variant="neutral">{stageTag}</Tag>
        </span>
      </div>

      {/* desktop matchup */}
      <div className="hidden items-center gap-3 sm:flex">
        <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
          <span className={cn("truncate text-sm", aFav ? "font-semibold text-fg" : "text-secondary")}>{aName}</span>
          {known ? <Flag team={m.team_a as string} size="text-base" link={false} /> : null}
        </span>
        <div className="w-44 shrink-0">
          {m.result ? (
            <p className="tnum text-center text-sm font-semibold text-fg">
              {m.result.a}–{m.result.b}
            </p>
          ) : hasProbs ? (
            <>
              <ProbBar aFav={aFav} bFav={bFav} pa={pa!} pd={pd!} pb={pb!} />
              <div className="tnum mt-1 flex justify-between text-[10px] text-secondary">
                <span>{simPct(pa, 0)}</span><span>{simPct(pd, 0)}</span><span>{simPct(pb, 0)}</span>
              </div>
            </>
          ) : (
            <p className="text-center text-[10px] text-muted">vs</p>
          )}
        </div>
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {known ? <Flag team={m.team_b as string} size="text-base" link={false} /> : null}
          <span className={cn("truncate text-sm", bFav ? "font-semibold text-fg" : "text-secondary")}>{bName}</span>
        </span>
      </div>

      {/* mobile matchup - known teams mirror the /matches row (flag · trigram · bar · trigram ·
          flag · fav%); undetermined knockout slots use full-width readable labels instead. */}
      {known ? (
        <div className="flex items-center gap-2 sm:hidden">
          <Flag team={m.team_a as string} size="text-base" link={false} />
          <span className={cn("tnum w-9 shrink-0 text-sm", aFav ? "font-semibold text-fg" : "text-secondary")}>{teamCode(m.team_a as string)}</span>
          <div className="min-w-0 flex-1">
            {m.result ? (
              <span className="tnum block text-center text-sm font-semibold text-fg">{m.result.a}–{m.result.b}</span>
            ) : hasProbs ? (
              <ProbBar aFav={aFav} bFav={bFav} pa={pa!} pd={pd!} pb={pb!} />
            ) : (
              <span className="block text-center text-[10px] text-muted">vs</span>
            )}
          </div>
          <span className={cn("tnum w-9 shrink-0 text-right text-sm", bFav ? "font-semibold text-fg" : "text-secondary")}>{teamCode(m.team_b as string)}</span>
          <Flag team={m.team_b as string} size="text-base" link={false} />
          <span className="tnum w-10 shrink-0 text-right text-xs text-secondary">{m.result ? "FT" : simPct(favPct, 0)}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-secondary sm:hidden">
          <span className="min-w-0 flex-1 truncate">{aName}</span>
          <span className="shrink-0 text-[10px] text-muted">vs</span>
          <span className="min-w-0 flex-1 truncate text-right">{bName}</span>
        </div>
      )}
    </div>
  );

  if (known) {
    return (
      <Link href={`/match/${m.match_id}`} className="group block">
        {inner}
      </Link>
    );
  }
  return <div className="group">{inner}</div>;
}
