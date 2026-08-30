import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { teamCode } from "@/lib/teamCodes";
import { simPct } from "@/lib/utils";
import { formatDateLabel, type DailyBriefing, type DailyFixture } from "@/lib/data/daily";

// Deterministic UTC kickoff time (server-rendered card; no hydration concerns). The full /daily
// page swaps to visitor-local time via LocalKickoff; this compact digest stays honest UTC.
function utcTime(iso: string | null): string {
  if (!iso) return "TBD";
  return `${new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC",
  }).format(new Date(iso))} UTC`;
}

/** One compact fixture row: kickoff, flags + trigrams, and the model's pre-day win % per side
 *  (the current run's odds - published before the day's first kickoff). Finished matches show
 *  the recorded score instead. Unresolved knockout slots degrade to a plain text matchup. */
function Row({ f }: { f: DailyFixture }) {
  const known = Boolean(f.team_a && f.team_b);
  if (!known) {
    return (
      <li className="flex items-center gap-2 py-0.5 text-xs text-secondary">
        <span className="tnum w-14 shrink-0 text-[11px] text-muted">{utcTime(f.kickoff_utc)}</span>
        <span className="min-w-0 flex-1 truncate">{f.team_a_slot ?? "TBC"}</span>
        <span className="shrink-0 text-[10px] text-muted">vs</span>
        <span className="min-w-0 flex-1 truncate text-right">{f.team_b_slot ?? "TBC"}</span>
      </li>
    );
  }
  const pa = f.probs?.p_team_a_win;
  const pb = f.probs?.p_team_b_win;
  return (
    <li className="flex items-center gap-2 py-0.5 text-sm">
      <span className="tnum w-14 shrink-0 text-[11px] text-muted">{utcTime(f.kickoff_utc)}</span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
        {pa != null ? <span className="tnum text-xs text-secondary">{simPct(pa, 0)}</span> : null}
        <span className="tnum font-medium text-fg">{teamCode(f.team_a as string)}</span>
        <Flag team={f.team_a as string} size="text-base" />
      </span>
      <span className="tnum w-9 shrink-0 text-center text-xs text-muted">
        {f.result ? `${f.result.a}–${f.result.b}` : "vs"}
      </span>
      <span className="flex min-w-0 flex-1 items-center gap-1.5">
        <Flag team={f.team_b as string} size="text-base" />
        <span className="tnum font-medium text-fg">{teamCode(f.team_b as string)}</span>
        {pb != null ? <span className="tnum text-xs text-secondary">{simPct(pb, 0)}</span> : null}
      </span>
    </li>
  );
}

/** Home digest of the self-populating daily briefing: today's slate with pre-day odds, the
 *  briefing's rule-based headline, and yesterday's recap one-liner when results exist. Reads
 *  ONLY what the daily layer already exposes (getDailyBriefing) - no new query shapes. */
export function DailyBriefCard({
  brief,
  yesterdayLine,
}: {
  brief: DailyBriefing;
  yesterdayLine: string | null;
}) {
  const href = brief.inWindow ? `/matches/day/${brief.date}` : "/matches";
  return (
    <Card>
      <CardHeader title="Daily brief" hint={formatDateLabel(brief.date)} />

      {brief.auto.headline ? (
        <p className="text-sm leading-relaxed text-fg">{brief.auto.headline}</p>
      ) : null}

      {brief.fixtures.length > 0 ? (
        <ul className="mt-3 space-y-1.5">
          {brief.fixtures.map((f) => (
            <Row key={f.match_id} f={f} />
          ))}
        </ul>
      ) : (
        // graceful empty state: a calendar day with no scheduled matches
        <div className="mt-3 flex items-center gap-2">
          <Tag variant="neutral">Rest day</Tag>
          <p className="text-sm text-secondary">No matches today.</p>
        </div>
      )}

      {yesterdayLine ? (
        <p className="mt-3 border-t border-border pt-2 text-xs leading-relaxed text-secondary">
          <span className="font-semibold text-fg">Yesterday:</span> {yesterdayLine}
        </p>
      ) : null}

      <Link
        href={href}
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-gold-strong hover:underline"
      >
        Read the full daily brief →
      </Link>
    </Card>
  );
}
