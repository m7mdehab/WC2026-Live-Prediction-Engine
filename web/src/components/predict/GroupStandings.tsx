"use client";

import { Flag } from "@/components/ui/Flag";
import { cn } from "@/lib/utils";
import type { PredictGroup } from "@/lib/types/brackets";

// Medal palette for the 1st/2nd/3rd rank badges. Gold/silver/bronze are intrinsic to a medal, so -
// like CountdownHero's gold gradients - these are literal metals rather than theme tokens. Each
// badge carries its own foreground colour, so it reads correctly on both the light and dark surface.
// Index 0/1/2 = rank-1/2/3. Exported so the Confirmation summary renders the same medal language.
export const MEDALS = [
  { n: "1", label: "1st", solid: "var(--medal-gold-solid)", fg: "var(--medal-gold-fg)", tint: "rgba(234,179,8,0.13)", border: "rgba(202,138,4,0.55)" },
  { n: "2", label: "2nd", solid: "var(--medal-silver-solid)", fg: "var(--medal-silver-fg)", tint: "rgba(148,163,184,0.18)", border: "rgba(148,163,184,0.6)" },
  { n: "3", label: "3rd", solid: "var(--medal-bronze-solid)", fg: "var(--medal-bronze-fg)", tint: "rgba(198,124,65,0.16)", border: "rgba(198,124,65,0.6)" },
] as const;

/** One group card: tap teams to rank 1st → 2nd → 3rd. A ranked team carries its medal badge; once
 *  three are ranked the fourth is shown eliminated ("Out"). Tapping a ranked team clears it (the
 *  ranks below compact up), so re-ranking is always reachable. */
function GroupCard({
  group,
  ranked,
  invalid,
  onTap,
}: {
  group: PredictGroup;
  /** ordered [1st, 2nd, 3rd] team names; length 0–3. */
  ranked: string[];
  invalid: boolean;
  onTap: (team: string) => void;
}) {
  const complete = ranked.length === 3;
  return (
    <fieldset
      className={cn(
        "rounded-card border bg-surface p-3",
        invalid ? "border-down" : "border-border"
      )}
    >
      <legend className="px-1 font-display text-xs font-semibold tracking-wide text-secondary uppercase">
        Group {group.group_code}
      </legend>
      <div className="mt-1 grid gap-1.5">
        {group.teams.map((t) => {
          const rank = ranked.indexOf(t.name); // 0 / 1 / 2, or -1 when unranked
          const medal = rank >= 0 ? MEDALS[rank] : null;
          const eliminated = complete && rank < 0;
          return (
            <button
              key={t.name}
              type="button"
              onClick={() => onTap(t.name)}
              disabled={eliminated}
              aria-pressed={rank >= 0}
              aria-label={
                medal
                  ? `${t.name}: ranked ${medal.label} in Group ${group.group_code}. Tap to clear.`
                  : eliminated
                    ? `${t.name}: eliminated from Group ${group.group_code}.`
                    : `Rank ${t.name} ${ranked.length === 0 ? "1st" : ranked.length === 1 ? "2nd" : "3rd"} in Group ${group.group_code}.`
              }
              className={cn(
                "flex items-center gap-2 rounded-md border px-2.5 py-2 text-left text-sm transition-colors",
                medal
                  ? "font-semibold text-fg"
                  : eliminated
                    ? "cursor-not-allowed border-border text-muted opacity-60"
                    : "cursor-pointer border-border text-secondary hover:bg-elevated hover:text-fg"
              )}
              style={medal ? { borderColor: medal.border, background: medal.tint } : undefined}
            >
              <Flag team={t.name} size="text-sm" link={false} />
              <span className="min-w-0 flex-1 truncate">{t.name}</span>
              {eliminated ? (
                <span className="shrink-0 rounded-full border border-border-strong px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-muted uppercase">
                  Out
                </span>
              ) : medal ? (
                <span
                  aria-hidden
                  className="tnum grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold"
                  style={{ background: medal.solid, color: medal.fg }}
                >
                  {medal.n}
                </span>
              ) : (
                <span
                  aria-hidden
                  className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-dashed border-border-strong"
                />
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function GroupStandings({
  groups,
  standings,
  invalidGroups,
  onRank,
}: {
  groups: PredictGroup[];
  /** group_code -> ordered [1st, 2nd, 3rd] (length 0–3). */
  standings: Record<string, string[]>;
  invalidGroups: Set<string>;
  /** Emits the group's next ranked order after a tap (the parent stores it + prunes the bracket). */
  onRank: (groupCode: string, nextRanked: string[]) => void;
}) {
  const rankedCount = groups.filter((g) => (standings[g.group_code]?.length ?? 0) === 3).length;

  // Tap semantics: a ranked team is cleared (and the ranks below it compact up); an unranked team
  // takes the next open rank; tapping the implicit 4th once three are ranked is a no-op.
  function tap(groupCode: string, team: string) {
    const ranked = standings[groupCode] ?? [];
    if (ranked.includes(team)) {
      onRank(groupCode, ranked.filter((t) => t !== team));
    } else if (ranked.length < 3) {
      onRank(groupCode, [...ranked, team]);
    }
  }

  return (
    <section aria-labelledby="group-standings-h">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="group-standings-h" className="font-display text-base font-semibold text-fg">
          Group standings
        </h2>
        <span className="tnum text-xs text-muted">
          {rankedCount}/{groups.length} groups ranked
        </span>
      </div>
      <p className="mb-3 text-xs text-muted">
        Tap to rank each group: 1st, then 2nd, then 3rd. The fourth team is eliminated. 8 of 12
        third-place teams advance; the model determines which, so some third-place picks may not
        appear in the Round of 32.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map((g) => (
          <GroupCard
            key={g.group_code}
            group={g}
            ranked={standings[g.group_code] ?? []}
            invalid={invalidGroups.has(g.group_code)}
            onTap={(team) => tap(g.group_code, team)}
          />
        ))}
      </div>
    </section>
  );
}
