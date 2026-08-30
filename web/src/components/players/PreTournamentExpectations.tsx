import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { cn } from "@/lib/utils";
import { roleTagVariant } from "@/lib/players";
import type { PreExpectationRow } from "@/lib/data/lockedProjections";

// The bare null-value glyph (the sanctioned standalone em-dash use): a missing frozen projection shows
// this, never a fabricated 0.
const NULL_GLYPH = "—";

/** A frozen/live projection value to one decimal, or the null glyph (never a fabricated 0). */
function fmtNum(v: number | null): string {
  return v == null ? NULL_GLYPH : v.toFixed(1);
}

/** The delta (live - pre) as signed text + a token tone. null -> the null glyph, muted. A rounded-to-
 *  zero delta is neutral (the model has not moved), positive is the up token, negative the down token. */
function fmtDelta(d: number | null): { text: string; tone: string } {
  if (d == null) return { text: NULL_GLYPH, tone: "text-muted" };
  const r = Math.round(d * 10) / 10;
  if (r === 0) return { text: "0.0", tone: "text-muted" };
  return { text: `${r > 0 ? "+" : ""}${r.toFixed(1)}`, tone: r > 0 ? "text-up" : "text-down" };
}

/** A right-aligned tabular numeric cell. */
function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div role="cell" className={cn("tnum shrink-0 text-right text-sm", className)}>
      {children}
    </div>
  );
}

function Delta({ d, muted, className }: { d: number | null; muted?: boolean; className?: string }) {
  const { text, tone } = fmtDelta(d);
  // An eliminated row's delta is greyed (the frozen as-played vs the full-tournament projection): the
  // sign tone is suppressed so a knocked-out player never reads as "the model moved".
  return (
    <div role="cell" className={cn("tnum shrink-0 text-right text-sm font-medium", muted ? "text-muted" : tone, className)}>
      {text}
    </div>
  );
}

/** A small lock glyph (currentColor, tokens only) marking a FROZEN eliminated-player "now". */
function LockGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("h-3 w-3", className)} fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

/** The muted OUT badge for an eliminated player: a lock glyph + "OUT <stage>" (e.g. "OUT R16"). Short
 *  label only (no prose); it marks the row's frozen "now" as an as-played projection, never a "Final". */
function OutBadge({ stage }: { stage: string }) {
  return (
    <Tag variant="neutral" className="shrink-0 gap-0.5 px-1.5 py-0 text-[10px] text-muted">
      <LockGlyph />
      OUT {stage}
    </Tag>
  );
}

/** The frozen pre-tournament expectations card: for each surfaced player, the FROZEN pre-tournament
 *  projection (from the committed baseline artifact) beside the LIVE re-projection and a delta badge,
 *  plus the running actuals - so a reader sees "the model expected X before, now projects Y, actual Z".
 *  A div grid with ARIA table roles (NOT a <table> element) so it never collides with the /players
 *  index-table layout guards. Fully responsive: the xA trio hides below md; the xG trio + actuals stay.
 *  Tokens only. */
export function PreTournamentExpectations({
  rows,
  asOf,
  label,
}: {
  rows: PreExpectationRow[];
  asOf: string | null;
  label: string;
}) {
  if (rows.length === 0) return null;

  const asOfLabel = asOf
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
        .format(new Date(`${asOf}T00:00:00Z`))
    : null;

  // header + row share this cell layout. xG trio (pre / now / delta) always; xA trio hidden below md.
  const XG_PRE = "w-9";
  const XG_NOW = "w-9";
  const XG_D = "w-12";

  return (
    <Card>
      <CardHeader title="Pre-tournament expectations" hint={`${rows.length} players`} />
      <p className="mb-3 max-w-prose text-xs leading-relaxed text-muted">
        The model&apos;s FROZEN {label}
        {asOfLabel ? ` (as of ${asOfLabel})` : ""} beside its live re-projection, with actuals so far.
        XG expected goals, XA expected assists; the delta is now minus the frozen pre-tournament
        projection (a re-projection cannot move the frozen number).
      </p>

      <div role="table" aria-label="Pre-tournament vs live expected goals and assists">
        {/* header */}
        <div
          role="row"
          className="flex items-end gap-2 border-b border-border pb-1 text-[10px] font-medium tracking-wide text-muted uppercase"
        >
          <div role="columnheader" className="min-w-0 flex-1">Player</div>
          <div role="columnheader" className={cn("shrink-0 text-right", XG_PRE)}>xG pre</div>
          <div role="columnheader" className={cn("shrink-0 text-right", XG_NOW)}>xG now</div>
          <div role="columnheader" className={cn("shrink-0 text-right", XG_D)}>{"Δ"}</div>
          <div role="columnheader" className={cn("hidden shrink-0 text-right md:block", XG_PRE)}>xA pre</div>
          <div role="columnheader" className={cn("hidden shrink-0 text-right md:block", XG_NOW)}>xA now</div>
          <div role="columnheader" className={cn("hidden shrink-0 text-right md:block", XG_D)}>{"Δ"}</div>
          <div role="columnheader" className="w-12 shrink-0 text-right">Actual</div>
        </div>

        <div className="divide-y divide-border/60">
          {rows.map((r) => {
            // an eliminated player's "now" is frozen (as-played): mute the now cells + delta, and mark
            // the row with the OUT badge so the frozen value never reads as a live re-projection.
            const nowTone = r.eliminated ? "text-muted" : "text-fg";
            return (
            <div key={r.id} role="row" data-eliminated={r.eliminated ? "true" : undefined} className="flex items-center gap-2 py-1.5">
              <div role="cell" className="flex min-w-0 flex-1 items-center gap-2">
                {/* The flag sits INSIDE this player Link, so it must NOT add its own /teams link
                    (a nested <a> is invalid HTML and trips React hydration) - link={false}. */}
                <Link href={`/players/${r.id}`} className="flex min-w-0 items-center gap-2 hover:underline">
                  <Flag team={r.nation} size="text-base" className="shrink-0" link={false} />
                  <span className={cn("min-w-0 truncate text-sm font-medium", r.eliminated ? "text-secondary" : "text-fg")}>{r.name}</span>
                </Link>
                {r.role ? (
                  <Tag variant={roleTagVariant(r.role)} className="shrink-0 px-1.5 py-0 text-[10px]">
                    {r.role}
                  </Tag>
                ) : null}
                {r.eliminated && r.outStageLabel ? <OutBadge stage={r.outStageLabel} /> : null}
              </div>
              <Num className={cn("text-secondary", XG_PRE)}>{fmtNum(r.xgPre)}</Num>
              <Num className={cn(nowTone, XG_NOW)}>{fmtNum(r.xgLive)}</Num>
              <Delta d={r.xgDelta} muted={r.eliminated} className={XG_D} />
              <Num className={cn("hidden text-secondary md:block", XG_PRE)}>{fmtNum(r.xaPre)}</Num>
              <Num className={cn("hidden md:block", nowTone, XG_NOW)}>{fmtNum(r.xaLive)}</Num>
              <Delta d={r.xaDelta} muted={r.eliminated} className={cn("hidden md:block", XG_D)} />
              <Num className="w-12 text-fg">
                {r.goalsActual}
                <span className="text-muted">/</span>
                {r.assistsActual}
              </Num>
            </div>
            );
          })}
        </div>
      </div>

      <p className="mt-3 text-[10px] leading-relaxed text-muted">
        Frozen baseline from the committed pre-tournament artifact; the now projection re-projects as
        actuals are recorded. An OUT badge marks an eliminated player, whose now is frozen at his
        as-played value. Actual shown as goals/assists.
      </p>
    </Card>
  );
}
