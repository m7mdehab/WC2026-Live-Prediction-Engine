"use client";

import { useState } from "react";
import Link from "next/link";
import { BracketCell } from "@/components/bracket/BracketCell";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { MEDALS } from "@/components/predict/GroupStandings";
import { SharePredictionModal } from "@/components/predict/SharePredictionModal";
import {
  ALL_KO_IDS,
  ROUND_LABEL,
  ROUND_OF,
  matchParticipants,
  type Round,
} from "@/lib/types/brackets";
import type { PredictGroup, GroupStanding } from "@/lib/types/brackets";
import type { BracketMatch, Stage } from "@/lib/types";

const STAGE_OF: Record<Round, Stage> = {
  R32: "round_of_32",
  R16: "round_of_16",
  QF: "quarter_finals",
  SF: "semi_finals",
  Final: "final",
};

/** Synthesize a /bracket BracketMatch from a finished user pick so we can REUSE the shared
 *  components/bracket/BracketCell to render the champion's path (no fork). Model probabilities are
 *  null - these are the user's hypothetical ties, so the cell shows flags + the picked winner
 *  bolded, with a "-" where model odds would sit. */
function synthMatch(
  id: string,
  teamA: string | null,
  teamB: string | null,
  pick: string
): BracketMatch {
  return {
    run_id: "",
    match_id: id,
    match_no: Number(id.slice(1)),
    stage: STAGE_OF[ROUND_OF[id]],
    slot_a: null,
    slot_b: null,
    team_a: teamA,
    team_b: teamB,
    a_resolved: false,
    b_resolved: false,
    p_a: null,
    p_draw: null,
    p_b: null,
    exp_goals_a: null,
    exp_goals_b: null,
    occ_prob_a: null,
    occ_prob_b: null,
    proj_winner: pick,
    champion_path: true,
    venue: null,
    city: null,
    country: null,
    kickoff_utc: null,
  };
}

/** Post-submit success state: a clear "saved" confirmation, the champion's full path rendered with
 *  the shared bracket cell, the 12 group winners, and a reset to enter another. */
export function Confirmation({
  displayName,
  champion,
  groups,
  standings,
  r32Slots,
  picks,
  emailed,
  onReset,
}: {
  displayName: string;
  champion: string;
  groups: PredictGroup[];
  standings: Record<string, GroupStanding>;
  r32Slots: Record<string, string>;
  picks: Record<string, string>;
  emailed: boolean;
  onReset: () => void;
}) {
  // The champion's run: its winning tie in each round, R32 → Final (ALL_KO_IDS is round-ordered).
  const pathMatches = ALL_KO_IDS.filter((id) => picks[id] === champion).map((id) => {
    const [a, b] = matchParticipants(id, r32Slots, picks);
    return { id, match: synthMatch(id, a, b, picks[id]) };
  });

  // Auto-open the share sheet on submit (Confirmation mounts exactly on a successful submission).
  // Reopenable via the "Share my bracket" button below.
  const [shareOpen, setShareOpen] = useState(true);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="champion-surface rounded-card border border-gold-line p-5 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-up-bg text-up">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5 12l5 5L20 6" />
          </svg>
        </span>
        <h1 className="mt-3 font-display text-2xl font-bold text-fg">Bracket locked in</h1>
        <p className="mt-1 text-sm text-secondary">
          Thanks, <span className="font-semibold text-fg">{displayName}</span>. Your full bracket is saved.
          {emailed ? " We'll be in touch with updates." : ""}
        </p>
      </div>

      {/* Champion */}
      <div className="mt-4 rounded-card border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-sm font-semibold tracking-wide text-secondary uppercase">
            Your champion
          </h2>
          <Tag variant="gold">Champion</Tag>
        </div>
        <div className="mt-2 flex items-center gap-3">
          <Flag team={champion} size="text-2xl" link={false} />
          <span className="text-lg font-bold text-fg">{champion}</span>
        </div>
      </div>

      {/* Champion's path - rendered with the shared bracket cell */}
      <div className="mt-4 rounded-card border border-border bg-surface p-4">
        <h2 className="mb-1 font-display text-sm font-semibold tracking-wide text-secondary uppercase">
          {champion}&apos;s path to the title
        </h2>
        <p className="mb-3 text-xs text-muted">Your picks, Round of 32 → Final. (No model odds on hypothetical ties.)</p>
        <div className="space-y-3">
          {pathMatches.map(({ id, match }) => (
            <div key={id}>
              <div className="mb-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                {ROUND_LABEL[ROUND_OF[id]]}
              </div>
              <BracketCell m={match} champion={champion} variant={ROUND_OF[id] === "Final" ? "final" : "sm"} />
            </div>
          ))}
        </div>
      </div>

      {/* Group standings - your ranked top three per group */}
      <div className="mt-4 rounded-card border border-border bg-surface p-4">
        <h2 className="mb-2 font-display text-sm font-semibold tracking-wide text-secondary uppercase">
          Group standings
        </h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {groups.map((g) => {
            const s = standings[g.group_code];
            if (!s) return null;
            const trio = [s.first, s.second, s.third];
            return (
              <li key={g.group_code} className="rounded-md border border-border px-2.5 py-2">
                <div className="mb-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                  Group {g.group_code}
                </div>
                <ol className="space-y-1">
                  {trio.map((team, i) => (
                    <li key={team} className="flex items-center gap-2 text-sm">
                      <span
                        aria-hidden
                        className="tnum grid h-4 w-4 shrink-0 place-items-center rounded-full text-[10px] font-bold"
                        style={{ background: MEDALS[i].solid, color: MEDALS[i].fg }}
                      >
                        {MEDALS[i].n}
                      </span>
                      <Flag team={team} size="text-sm" link={false} />
                      <span className="min-w-0 flex-1 truncate text-fg">{team}</span>
                    </li>
                  ))}
                </ol>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Share is the primary post-submit action: a friend who taps the link lands on /predict to
          make their own bracket. */}
      <button
        type="button"
        onClick={() => setShareOpen(true)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-3 text-sm font-semibold text-on-gold shadow-[var(--shadow-card)] transition-colors hover:bg-gold-strong"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v13M12 3l-4 4M12 3l4 4" />
          <path d="M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" />
        </svg>
        Share my bracket
      </button>

      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <Link
          href="/forecast#bracket"
          className="flex-1 rounded-md bg-confident px-4 py-2.5 text-center text-sm font-semibold text-inverse hover:bg-confident/90"
        >
          See the model&apos;s projected bracket
        </Link>
        <button
          type="button"
          onClick={onReset}
          className="flex-1 rounded-md border border-border bg-surface px-4 py-2.5 text-center text-sm font-semibold text-secondary hover:bg-elevated hover:text-fg"
        >
          Enter another
        </button>
      </div>

      <SharePredictionModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        champion={champion}
        groups={groups}
        standings={standings}
        r32Slots={r32Slots}
        picks={picks}
      />
    </div>
  );
}
