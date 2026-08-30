import Link from "next/link";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { fmtRating, roleLabel } from "@/lib/players";
import type { AwardRaceEntry, PositionLeaders as PositionLeadersData } from "@/lib/types/players";

// The four "best at each position" boards (A7), each the model's top-5 by a role-appropriate overall
// rating (role headline expected blended with role key positional percentiles). Surfaced verbatim.
const COLUMNS: { key: keyof PositionLeadersData; role: string }[] = [
  { key: "gk", role: "GK" },
  { key: "df", role: "DF" },
  { key: "mf", role: "MF" },
  { key: "fw", role: "FW" },
];

/** The position RATING figure. The value is a 0..100 role rating; it is rendered through fmtRating,
 *  which HARD-CLAMPS the display to the 0-100 ceiling, so a figure can never render above its own scale
 *  even if the artifact value overshoots (the GK board's blended magnitude can exceed 100 until the
 *  percentile-within-role artifact lands). Ordering is unaffected - the clamp is display-only. */
function ratingOf(e: AwardRaceEntry): number | null {
  return e.expectedValue;
}

/** One contender ROW (rank + flag + full name + rating figure), shared by the always-visible runners-up
 *  and the "Show more" overflow so both render identically. `rank` is the 1-based board rank (the leader
 *  is rank 1), shown verbatim so the overflow keeps counting from 4 with no gap. */
function ContenderRow({ entry, rank }: { entry: AwardRaceEntry; rank: number }) {
  return (
    <li>
      <Link
        href={`/players/${entry.playerId}`}
        className="flex items-center gap-2 rounded-md py-0.5 transition hover:opacity-90"
      >
        <span className="tnum w-3 shrink-0 text-right text-[11px] font-semibold text-muted">
          {rank}
        </span>
        <Flag team={entry.nation} size="text-sm" link={false} />
        <span className="min-w-0 flex-1 truncate text-xs text-secondary">{entry.name}</span>
        <span className="tnum shrink-0 whitespace-nowrap text-xs font-semibold text-fg">
          {fmtRating(ratingOf(entry))}
        </span>
      </Link>
    </li>
  );
}

/** One position column, mirroring the award cards' big-leader + compact-cluster shape: the rank-1
 *  leader renders LARGE (flag + full name + rating figure), with ranks 2-3 bunched directly below in a
 *  TIGHT one-line cluster (rank + flag + name + rating) and ranks 4+ folded COLLAPSED into a native
 *  <details>/<summary> ("Show more"). These are static server surfaces, so the disclosure is native
 *  <details> (no client state); the overflow body is present in SSR markup but hidden until expanded.
 *  The leader is the big figure only and is NOT repeated in the cluster (it starts at rank 2). Full
 *  names at full width; only extreme outliers truncate (min-w-0 + truncate safety). Nothing wraps to a
 *  second line; the "Rating" sublabel and the "Best <role>" title are sized/placed never to wrap. */
function PositionColumn({ role, board }: { role: string; board: AwardRaceEntry[] }) {
  const leader = board[0] ?? null;
  // Contenders below the big leader: ranks 2+. De-dupes the leader so it is never shown twice. Ranks
  // 2-3 stay visible; ranks 4+ fold into the "Show more" <details>.
  const contenders = board.slice(1);
  const visible = contenders.slice(0, 2);
  const overflow = contenders.slice(2);

  return (
    <div className="champion-surface flex flex-col rounded-card border p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate font-display text-sm font-semibold tracking-wide text-gold-strong uppercase">
          Best {roleLabel(role)}
        </h3>
        <span className="shrink-0 whitespace-nowrap text-[10px] font-medium tracking-wide text-muted uppercase">
          Model pick
        </span>
      </div>

      {!leader ? (
        <p className="mt-3 text-sm text-muted">No board published yet.</p>
      ) : (
        <>
          <Link
            href={`/players/${leader.playerId}`}
            className="mt-3 flex items-center gap-3 rounded-md py-1 transition hover:opacity-90"
          >
            <Flag team={leader.nation} size="text-2xl" className="champion-flag-ring shrink-0" link={false} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-base font-bold text-fg">{leader.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-secondary">
                <Tag variant="gold" className="shrink-0 px-1.5 py-0">Lead</Tag>
                <span className="truncate">{leader.nation}</span>
              </span>
            </span>
            <span className="tnum shrink-0 whitespace-nowrap font-display text-2xl font-bold text-fg">
              {fmtRating(ratingOf(leader))}
            </span>
          </Link>

          {contenders.length > 0 ? (
            <div className="mt-3 border-t border-border pt-2">
              <div className="flex items-baseline justify-between gap-2 text-[10px] font-medium tracking-wide text-muted uppercase">
                <span className="truncate">Contenders</span>
                <span className="shrink-0 whitespace-nowrap">Rating</span>
              </div>
              <ol className="mt-1.5 flex flex-col gap-1.5">
                {visible.map((e, i) => (
                  <ContenderRow key={e.playerId} entry={e} rank={i + 2} />
                ))}
              </ol>
              {overflow.length > 0 ? (
                <details className="group mt-1.5">
                  <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium tracking-wide text-muted uppercase whitespace-nowrap transition hover:text-secondary">
                    <span>Show more</span>
                    <span className="tnum text-muted/80">({overflow.length})</span>
                  </summary>
                  <ol className="mt-1.5 flex flex-col gap-1.5">
                    {overflow.map((e, i) => (
                      <ContenderRow key={e.playerId} entry={e} rank={i + 4} />
                    ))}
                  </ol>
                </details>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

/** "Best at each position": four columns (GK / DF / MF / FW) of the model's top-5, each ranked by a
 *  role overall rating that blends the role headline projection with the role's key positional
 *  percentiles. Each column leads with its big rank-1 leader and bunches ranks 2-5 in a compact cluster
 *  below (ranks 2-3 visible, ranks 4+ in a "Show more" <details>), mirroring the AwardCards gold framing. */
export function PositionLeaders({ leaders }: { leaders: PositionLeadersData }) {
  return (
    <div>
      <h2 className="font-display text-lg font-bold text-fg">Best at each position</h2>
      <p className="mt-1 max-w-prose text-xs text-secondary">
        The model&apos;s pick for each position. There is no official per-position award to compare
        against, so these are the model&apos;s call, not a verdict; the rating is a standing WITHIN each
        role, not a cross-role magnitude.{" "}
        <Link href="/methodology#player-projections" className="text-confident hover:underline">
          How the rating works
        </Link>
      </p>
      {/* Single-column at the phone base, stepping up to two-up at sm and four-up at xl. */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        {COLUMNS.map(({ key, role }) => (
          <PositionColumn key={key} role={role} board={leaders[key]} />
        ))}
      </div>
    </div>
  );
}
