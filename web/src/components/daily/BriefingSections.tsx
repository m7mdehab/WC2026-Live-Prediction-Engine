import Link from "next/link";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { cn, simPct } from "@/lib/utils";
import type { BriefingAuto, RecapRow, Mover } from "@/lib/data/daily";

// The body of a daily briefing, SELF-POPULATED from model data (computed server-side on read in
// lib/data/daily.ts + dailyAuto.ts). Each section renders auto content whenever its inputs exist;
// an honest pending state remains only when the inputs genuinely don't exist yet (e.g. movers
// before any post-matchday run).

function SectionCard({
  title,
  hint,
  pending,
  pendingTag,
  pendingText,
  children,
}: {
  title: string;
  hint?: string | null;
  pending: boolean;
  pendingTag?: string;
  pendingText: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-card border bg-surface p-4",
        pending ? "border-dashed border-border" : "border-border"
      )}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="font-display text-sm font-semibold tracking-wide text-secondary uppercase">
          {title}
        </h3>
        {pending && pendingTag ? <Tag variant="neutral">{pendingTag}</Tag> : null}
        {!pending && hint ? <span className="text-xs text-muted">{hint}</span> : null}
      </div>
      {pending ? <p className="max-w-prose text-sm text-muted">{pendingText}</p> : children}
    </div>
  );
}

/** One finished match: score line + the model's pre-match call and its verdict. */
function RecapLine({ r }: { r: RecapRow }) {
  const winner = r.outcome === "a" ? r.team_a : r.outcome === "b" ? r.team_b : null;
  const verdict =
    r.called == null
      ? null
      : r.called
        ? { tag: "Called it", variant: "up" as const, text: winner ? `${winner} ${simPct(r.outcomeP)}` : `draw ${simPct(r.outcomeP)}` }
        : {
            tag: "Missed",
            variant: "down" as const,
            text: `had ${r.modal === "a" ? r.team_a : r.modal === "b" ? r.team_b : "the draw"} at ${simPct(r.modalP)}`,
          };
  return (
    <li className="py-2">
      <Link href={`/match/${r.match_id}`} className="group block">
        <span className="flex items-center justify-center gap-2 text-sm">
          <span className="flex min-w-0 flex-1 items-center justify-end gap-2">
            <span className={cn("truncate", r.outcome === "a" ? "font-semibold text-fg" : "text-secondary")}>
              {r.team_a}
            </span>
            <Flag team={r.team_a} size="text-sm" link={false} />
          </span>
          <span className="tnum shrink-0 rounded bg-elevated px-1.5 py-0.5 font-semibold text-fg group-hover:bg-border">
            {r.scoreA}–{r.scoreB}
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Flag team={r.team_b} size="text-sm" link={false} />
            <span className={cn("truncate", r.outcome === "b" ? "font-semibold text-fg" : "text-secondary")}>
              {r.team_b}
            </span>
          </span>
        </span>
        {verdict ? (
          <span className="mt-1 flex items-center justify-center gap-1.5 text-xs text-secondary">
            <Tag variant={verdict.variant}>{verdict.tag}</Tag>
            <span>{verdict.text}</span>
          </span>
        ) : (
          <span className="mt-1 block text-center text-xs text-muted">No pre-match odds recorded.</span>
        )}
      </Link>
    </li>
  );
}

function MoverList({ title, movers, up }: { title: string; movers: Mover[]; up: boolean }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold tracking-wider text-muted uppercase">{title}</div>
      {movers.length === 0 ? (
        <p className="text-xs text-muted">None.</p>
      ) : (
        <ul className="space-y-1">
          {movers.map((m) => (
            <li key={m.team} className="flex items-center gap-2 text-sm">
              <Flag team={m.team} size="text-sm" />
              <span className="min-w-0 flex-1 truncate text-fg">{m.team}</span>
              <span className={cn("tnum shrink-0 text-xs font-semibold", up ? "text-up" : "text-down")}>
                {up ? "+" : "−"}{Math.abs(m.delta * 100).toFixed(1)} pts
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** The four computed sections of a daily briefing. `hasFixtures` is whether THIS date has matches
 *  scheduled (drives the recap's pending copy). */
export function BriefingSections({
  auto,
  hasFixtures,
  watchingLabel,
}: {
  auto: BriefingAuto;
  hasFixtures: boolean;
  watchingLabel: string | null;
}) {
  const { headline, recap, movers, watching } = auto;
  const namedWatch = watching?.fixtures.filter((f) => f.team_a && f.team_b) ?? [];
  const unnamedWatch = (watching?.fixtures.length ?? 0) - namedWatch.length;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-semibold text-fg">Briefing</h2>
        <span className="text-xs text-muted">Generated from the model&apos;s published runs</span>
      </div>

      {/* headline */}
      <SectionCard
        title="Headline"
        pending={!headline}
        pendingTag="Pending"
        pendingText="The day's one-line story appears once a model run is connected."
      >
        <p className="max-w-prose text-sm font-medium text-fg">{headline}</p>
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* result recap */}
        <SectionCard
          title="Result recap"
          hint="vs the pre-matchday run"
          pending={recap.length === 0}
          pendingTag={hasFixtures ? "After kickoff" : undefined}
          pendingText={
            hasFixtures
              ? "How the day's completed matches played out, and where the model called it right or missed. Populates as results are recorded."
              : "No matches on this date."
          }
        >
          <ul className="divide-y divide-border">
            {recap.map((r) => (
              <RecapLine key={r.match_id} r={r} />
            ))}
          </ul>
        </SectionCard>

        {/* biggest movers */}
        <SectionCard
          title="Biggest movers"
          hint="champion odds, percentage points"
          pending={!movers}
          pendingText="Updates after the next model run folds in new results."
        >
          {movers ? (
            <div className="grid grid-cols-2 gap-3">
              <MoverList title="Risers" movers={movers.risers} up />
              <MoverList title="Fallers" movers={movers.fallers} up={false} />
            </div>
          ) : null}
        </SectionCard>
      </div>

      {/* what the model is watching */}
      <SectionCard
        title="What the model is watching"
        hint={watchingLabel ? `next matchday: ${watchingLabel}` : null}
        pending={!watching || (namedWatch.length === 0 && unnamedWatch === 0)}
        pendingTag="Pending"
        pendingText="The fixtures the forecast is most sensitive to, once the next matchday is known."
      >
        {watching ? (
          <>
            <ul className="divide-y divide-border">
              {namedWatch.map((f) => {
                const pa = f.probs?.p_team_a_win, pd = f.probs?.p_draw, pb = f.probs?.p_team_b_win;
                const isUpset = watching.upset?.match_id === f.match_id;
                return (
                  <li key={f.match_id} className="flex items-center gap-2 py-1.5 text-sm">
                    <Link href={`/match/${f.match_id}`} className="flex min-w-0 flex-1 items-center gap-2 hover:underline">
                      <Flag team={f.team_a!} size="text-sm" link={false} />
                      <span className="min-w-0 truncate text-fg">
                        {f.team_a} vs {f.team_b}
                      </span>
                      <Flag team={f.team_b!} size="text-sm" link={false} />
                    </Link>
                    {isUpset && watching.upset ? (
                      <Tag variant="upset">Upset watch {simPct(watching.upset.p, 0)}</Tag>
                    ) : null}
                    <span className="tnum shrink-0 text-xs text-secondary">
                      {pa != null && pd != null && pb != null
                        ? `${simPct(pa, 0)} / ${simPct(pd, 0)} / ${simPct(pb, 0)}`
                        : "odds pending"}
                    </span>
                  </li>
                );
              })}
            </ul>
            {watching.upset ? (
              <p className="mt-2 text-xs text-muted">
                Biggest potential upset: {watching.upset.underdog} to beat {watching.upset.favorite}{" "}
                ({simPct(watching.upset.p, 0)}). Sorted closest first.
              </p>
            ) : null}
            {unnamedWatch > 0 ? (
              <p className="mt-2 text-xs text-muted">
                {unnamedWatch} more {unnamedWatch === 1 ? "tie settles" : "ties settle"} as the bracket resolves.
              </p>
            ) : null}
          </>
        ) : null}
      </SectionCard>
    </section>
  );
}
