import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { LocalKickoff } from "@/components/ui/LocalKickoff";
import { venueTz, formatVenueLocal } from "@/lib/venueTz";
import type { Fixture } from "@/lib/types";

const STAGE_LABEL: Record<string, string> = {
  group: "Group stage",
  round_of_32: "Round of 32",
  round_of_16: "Round of 16",
  quarter_finals: "Quarter-final",
  semi_finals: "Semi-final",
  third_place_playoff: "Third-place playoff",
  final: "Final",
};

/** Match identity: stage/group/matchday, teams, kickoff (visitor-local + venue-local), venue.
 *  When the match is finished, the recorded final score sits under the title ("2 – 0 · Full time").
 *  Used by the canonical /match page; the expandable /matches row shows teams itself and renders
 *  only MatchBody. */
export function MatchHeader({
  fixture,
  result = null,
  finished = false,
}: {
  fixture: Fixture;
  /** Recorded final score, team_a/team_b orientation. */
  result?: { a: number; b: number } | null;
  finished?: boolean;
}) {
  const a = fixture.team_a as string;
  const b = fixture.team_b as string;
  const tz = venueTz(fixture.venue);
  const vLocal = tz ? formatVenueLocal(fixture.kickoff_utc, tz) : null;

  return (
    <div>
      <div className="text-xs font-medium tracking-wide text-secondary uppercase">
        {STAGE_LABEL[fixture.stage] ?? fixture.stage}
        {fixture.group_code ? ` · Group ${fixture.group_code}` : ""} · Match {fixture.match_no}
      </div>
      <h1 className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 font-display text-2xl font-bold text-fg">
        <span className="inline-flex items-center gap-2"><Flag team={a} size="text-2xl" />{a}</span>
        <span className="text-base font-normal text-muted">vs</span>
        <span className="inline-flex items-center gap-2"><Flag team={b} size="text-2xl" />{b}</span>
      </h1>
      {finished ? (
        <div className="mt-2 flex items-center gap-2">
          {result ? (
            <span className="tnum font-display text-xl font-bold text-fg">
              {result.a} – {result.b}
            </span>
          ) : null}
          <Tag variant="neutral">Full time</Tag>
        </div>
      ) : null}
      <div className="mt-1 space-y-0.5 text-sm text-muted">
        <p className="tnum">
          <LocalKickoff iso={fixture.kickoff_utc} />
          <span className="text-xs"> your time</span>
          {vLocal ? (
            <>
              {" · "}
              <span className="tnum">{vLocal.time} {vLocal.zone}</span>
              <span className="text-xs"> at the venue</span>
            </>
          ) : null}
        </p>
        <p>{[fixture.venue, fixture.city, fixture.country].filter(Boolean).join(", ")}</p>
      </div>
    </div>
  );
}
