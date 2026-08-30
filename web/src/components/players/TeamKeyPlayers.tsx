import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { fmtMetric, metricLabel, roleTagVariant } from "@/lib/players";
import type { TeamPlayerLink } from "@/lib/data/players";

/** "Key players" cross-link on a team profile: the team's tracked players, each linking to their
 *  /players/[id] profile, ordered strongest-first by headline projection. Tasteful, matches the
 *  team page's card language. Renders nothing when the team has no tracked players. */
export function TeamKeyPlayers({ players }: { players: TeamPlayerLink[] }) {
  if (players.length === 0) return null;
  return (
    <Card>
      <CardHeader title="Key players" hint="tracked squad" />
      <ul className="divide-y divide-border">
        {players.map((p) => (
          <li key={p.id}>
            <Link
              href={`/players/${p.id}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1 py-2 transition hover:bg-elevated"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-fg">{p.name}</span>
                {p.role ? (
                  <Tag variant={roleTagVariant(p.role)} className="shrink-0 px-1.5 py-0 text-[10px]">
                    {p.role}
                  </Tag>
                ) : null}
              </span>
              <span className="tnum shrink-0 text-right text-xs text-muted">
                {p.headlineExpected != null && p.headlineMetric
                  ? `${fmtMetric(p.headlineExpected)} ${metricLabel(p.headlineMetric).toLowerCase()}`
                  : "actuals only"}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] text-muted">
        Projected headline output. Open a player for their full expected-vs-actual profile.
      </p>
    </Card>
  );
}
