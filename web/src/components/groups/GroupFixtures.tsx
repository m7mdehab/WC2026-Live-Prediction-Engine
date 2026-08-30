import { Flag } from "@/components/ui/Flag";
import { LocalKickoff } from "@/components/ui/LocalKickoff";
import { teamCode } from "@/lib/teamCodes";
import { cn } from "@/lib/utils";
import type { GroupFixture } from "@/lib/data/groups";

/** Compact fixture/results list under a group card. Completed matches show the score; scheduled
 *  ones show the venue-local kickoff (LocalKickoff renders UTC at first paint, then the visitor's
 *  local time on mount - the same mechanism the match rows use). FIFA trigrams keep it tight. */
export function GroupFixtures({ fixtures, bare = false }: { fixtures: GroupFixture[]; bare?: boolean }) {
  if (fixtures.length === 0) return null;
  // `bare` drops the top divider + margin when the list is nested inside a disclosure that already
  // provides them (so we never stack two hairlines); inline use keeps the separating chrome.
  return (
    <div className={bare ? "pt-1.5" : "mt-3 border-t border-border pt-2"}>
      <ul className="space-y-1">
        {fixtures.map((f) => {
          const done = f.status === "completed";
          const aWon = done && (f.scoreA ?? 0) > (f.scoreB ?? 0);
          const bWon = done && (f.scoreB ?? 0) > (f.scoreA ?? 0);
          return (
            <li key={f.match_id} className="grid items-center gap-2 text-[11px]"
                style={{ gridTemplateColumns: "minmax(0,1fr) auto minmax(0,1fr)" }}>
              {/* team A (right-aligned toward the score) */}
              <span className="flex min-w-0 items-center justify-end gap-1.5">
                <span className={cn("tnum truncate", aWon ? "font-semibold text-fg" : "text-secondary")}>
                  {f.team_a ? teamCode(f.team_a) : "TBD"}
                </span>
                {f.team_a ? <Flag team={f.team_a} size="text-[11px]" /> : null}
              </span>

              {/* score or kickoff */}
              {done ? (
                <span className="tnum shrink-0 rounded bg-elevated px-1.5 py-0.5 font-bold text-fg">
                  {f.scoreA}–{f.scoreB}
                </span>
              ) : (
                <LocalKickoff iso={f.kickoff_utc} className="tnum shrink-0 text-[10px] text-muted" />
              )}

              {/* team B */}
              <span className="flex min-w-0 items-center gap-1.5">
                {f.team_b ? <Flag team={f.team_b} size="text-[11px]" /> : null}
                <span className={cn("tnum truncate", bWon ? "font-semibold text-fg" : "text-secondary")}>
                  {f.team_b ? teamCode(f.team_b) : "TBD"}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
