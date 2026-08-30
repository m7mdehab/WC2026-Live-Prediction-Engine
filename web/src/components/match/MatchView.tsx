import { MatchHeader } from "@/components/match/MatchHeader";
import { MatchBody } from "@/components/match/MatchBody";
import type { MatchDetail } from "@/lib/types";

/** The canonical /match page body: team header + the full breakdown. The expandable /matches row
 *  reuses MatchBody directly (it shows the teams itself). One source of truth - no fork. */
export function MatchView({ detail }: { detail: MatchDetail }) {
  return (
    <div className="mx-auto max-w-3xl">
      <MatchHeader
        fixture={detail.fixture}
        result={detail.result ?? null}
        finished={detail.finished ?? false}
      />
      <div className="mt-5">
        <MatchBody detail={detail} />
      </div>
    </div>
  );
}
