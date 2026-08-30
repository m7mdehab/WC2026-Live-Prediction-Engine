import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { cn, simPct } from "@/lib/utils";
import type { TeamsIndex, TeamIndexEntry, TeamGroup } from "@/lib/types/teams";

function formatUpdated(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(iso));
}

/** One team row in a group card - flag, name, headline champion %, and an advance-group bar. */
function TeamRow({ t }: { t: TeamIndexEntry }) {
  return (
    <Link
      href={`/teams/${t.id}`}
      className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-1.5 py-1.5 transition hover:bg-elevated"
    >
      <Flag team={t.team} size="text-base" link={false} />
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-sm font-medium text-fg">{t.team}</span>
        {t.hostFlag ? <Tag variant="gold" className="shrink-0 px-1 py-0 text-[9px]">Host</Tag> : null}
      </span>
      <span className="flex items-center gap-2">
        <span className="hidden h-1.5 w-14 overflow-hidden rounded-full bg-elevated sm:block" title="Advance from group">
          <span className="block h-full rounded-full bg-confident" style={{ width: `${(t.advanceGroup ?? 0) * 100}%` }} />
        </span>
        <span
          className={cn("tnum w-12 shrink-0 text-right text-sm font-semibold", (t.champion ?? 0) > 0.005 ? "text-gold-strong" : "text-muted")}
          title="Champion probability"
        >
          {simPct(t.champion)}
        </span>
      </span>
    </Link>
  );
}

function GroupCard({ g }: { g: TeamGroup }) {
  return (
    <Card className="flex flex-col" padding="p-3 sm:p-4">
      <h2 className="mb-2 font-display text-sm font-semibold tracking-wide text-fg uppercase">Group {g.groupCode}</h2>
      <div className="divide-y divide-border">
        {g.teams.map((t) => <TeamRow key={t.id} t={t} />)}
      </div>
    </Card>
  );
}

/** The /teams index - all 48 teams, grouped A–L, each linking to its profile. The headline number
 *  is champion probability (gold), with an advance-group bar for context. */
export function TeamsIndexView({ data }: { data: TeamsIndex }) {
  const { run, groups, demo } = data;
  const total = groups.reduce((s, g) => s + g.teams.length, 0);

  return (
    <section>
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <h1 className="font-display text-2xl font-bold text-fg">Teams</h1>
        {demo ? <Tag variant="upset">Sample data</Tag> : null}
      </div>
      <p className="max-w-prose text-sm text-secondary">
        All {total || 48} teams by group. Each shows its title odds and chance to advance. Open a team
        for its full forecast, projected group finish and fixtures.
      </p>
      {run ? (
        <p className="tnum mt-2 text-xs text-muted">
          Champion % (gold) · advance-from-group (bar) · Updated {formatUpdated(run.created_at)}
        </p>
      ) : null}

      {groups.length === 0 ? (
        <p className="mt-4 text-sm text-secondary">No forecast published yet.</p>
      ) : (
        // Two-up at the phone base breakpoint, preserving the larger sm / xl steps.
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {groups.map((g) => <GroupCard key={g.groupCode} g={g} />)}
        </div>
      )}
    </section>
  );
}
