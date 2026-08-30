"use client";

import { useState } from "react";
import { Flag } from "@/components/ui/Flag";
import { LaurelCup } from "@/components/brand/marks";
import { PickMatch } from "@/components/predict/PickMatch";
import { cn } from "@/lib/utils";
import {
  ALL_KO_IDS,
  FINAL_ID,
  KO_MATCHES,
  R32_MATCHES,
  ROUND_LABEL,
  ROUND_OF,
  championOf,
  championPathIds,
  matchParticipants,
  type Round,
} from "@/lib/types/brackets";

// Desktop two-halves layout (scroll-free, ≥1280px). Mirrors components/bracket/DesktopBracket's
// SF-feeder topology - the two halves are the SF1/SF2 subtrees, NOT the M73–M80 / M81–M88 bands.
const LEFT = {
  r32: ["M74", "M77", "M73", "M75", "M83", "M84", "M81", "M82"],
  r16: ["M89", "M90", "M93", "M94"],
  qf: ["M97", "M98"],
  sf: ["M101"],
};
const RIGHT = {
  r32: ["M76", "M78", "M79", "M80", "M86", "M88", "M85", "M87"],
  r16: ["M91", "M92", "M95", "M96"],
  qf: ["M99", "M100"],
  sf: ["M102"],
};

const MOBILE_TABS = [
  { key: "path", label: "Champion's path" },
  { key: "R32", label: "R32" },
  { key: "R16", label: "R16" },
  { key: "QF", label: "QF" },
  { key: "SF", label: "SF" },
  { key: "Final", label: "Final" },
] as const;
type TabKey = (typeof MOBILE_TABS)[number]["key"];

const ROUND_IDS: Record<Round, string[]> = {
  R32: R32_MATCHES.map((m) => m.id),
  R16: KO_MATCHES.filter((m) => m.round === "R16").map((m) => m.id),
  QF: KO_MATCHES.filter((m) => m.round === "QF").map((m) => m.id),
  SF: KO_MATCHES.filter((m) => m.round === "SF").map((m) => m.id),
  Final: [FINAL_ID],
};

export interface KnockoutPickerProps {
  r32Slots: Record<string, string>;
  picks: Record<string, string>;
  onPick: (matchId: string, team: string) => void;
}

export function KnockoutPicker({ r32Slots, picks, onPick }: KnockoutPickerProps) {
  const [tab, setTab] = useState<TabKey>("path");

  const champion = championOf(picks);
  const path = championPathIds(r32Slots, picks);
  const made = ALL_KO_IDS.filter((id) => picks[id]).length;

  const cell = (id: string, variant: "sm" | "final" = "sm") => {
    const [a, b] = matchParticipants(id, r32Slots, picks);
    return (
      <PickMatch
        key={id}
        label={`${ROUND_LABEL[ROUND_OF[id]]} · ${id}`}
        teamA={a}
        teamB={b}
        picked={picks[id] ?? null}
        onPath={path.has(id)}
        variant={variant}
        onPick={(team) => onPick(id, team)}
      />
    );
  };

  return (
    <section aria-labelledby="knockout-h">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <h2 id="knockout-h" className="font-display text-base font-semibold text-fg">
          Knockout bracket
        </h2>
        <span className="tnum text-xs text-muted">{made}/{ALL_KO_IDS.length} ties</span>
      </div>
      <p className="mb-3 text-xs text-secondary">
        Your group winners seed the Round of 32; the model fills runners-up and best-thirds. Tap a
        winner to advance each tie; the Final winner becomes your champion.
      </p>

      {/* Champion banner (derived from the Final pick). */}
      {champion ? (
        <div className="champion-surface mb-4 flex items-center gap-3 rounded-card border border-gold-line px-4 py-2.5">
          <LaurelCup size={30} title="Your champion" className="text-gold" />
          <div className="leading-tight">
            <div className="text-[10px] font-semibold tracking-wider text-gold-strong uppercase">
              Your champion
            </div>
            <div className="flex items-center gap-2">
              <Flag team={champion} size="text-lg" link={false} />
              <span className="font-display text-lg font-bold text-fg">{champion}</span>
            </div>
          </div>
        </div>
      ) : null}

      {/* ---------- Desktop: scroll-free two-halves bracket (≥1280px) ----------
          Break out of the form's content cap to a wider, viewport-capped container so all 9
          columns show without horizontal scroll (mirrors components/bracket's /bracket treatment).
          The AppFrame root has overflow-x-clip, so the 100vw breakout adds no page h-scroll. */}
      <div className="hidden xl:block">
        <div className="mx-[calc(50%-50vw)] w-screen">
          <div className="mx-auto max-w-[1600px] px-4 md:px-6">
            <div className="flex items-stretch gap-2">
              <Column header="Round of 32" ids={LEFT.r32} render={cell} />
              <Column header="Round of 16" ids={LEFT.r16} render={cell} />
              <Column header="Quarter-finals" ids={LEFT.qf} render={cell} />
              <Column header="Semi-finals" ids={LEFT.sf} render={cell} />

              <div className="flex min-w-0 flex-[1.35] flex-col">
                <div className="mb-2 text-center text-[10px] font-semibold tracking-wider text-gold-strong uppercase">
                  Final
                </div>
                <div className="flex flex-1 flex-col justify-center">{cell(FINAL_ID, "final")}</div>
              </div>

              <Column header="Semi-finals" ids={RIGHT.sf} render={cell} />
              <Column header="Quarter-finals" ids={RIGHT.qf} render={cell} />
              <Column header="Round of 16" ids={RIGHT.r16} render={cell} />
              <Column header="Round of 32" ids={RIGHT.r32} render={cell} />
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Mobile / tablet: round-by-round tabs, champion's-path default ---------- */}
      <div className="xl:hidden">
        <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {MOBILE_TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-pressed={active}
                className={cn(
                  "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                  active
                    ? "border-confident bg-confident/10 text-confident"
                    : "border-border text-secondary hover:bg-elevated"
                )}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === "path" ? (
          <PathView champion={champion} picks={picks} cell={cell} />
        ) : (
          <RoundView round={tab} cell={cell} />
        )}
      </div>
    </section>
  );
}

function Column({
  header,
  ids,
  render,
}: {
  header: string;
  ids: string[];
  render: (id: string) => React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-2 truncate text-center text-[10px] font-semibold tracking-wider text-muted uppercase">
        {header}
      </div>
      <div className="flex flex-1 flex-col justify-around gap-2">{ids.map((id) => render(id))}</div>
    </div>
  );
}

/** The first round with an undecided tie - the user's "what to pick next" when no champion yet. */
const ROUND_ORDER: Round[] = ["R32", "R16", "QF", "SF", "Final"];
function activeRound(picks: Record<string, string>): Round {
  for (const r of ROUND_ORDER) {
    if (ROUND_IDS[r].some((id) => !picks[id])) return r;
  }
  return "Final";
}

function PathView({
  champion,
  picks,
  cell,
}: {
  champion: string | null;
  picks: Record<string, string>;
  cell: (id: string, v?: "sm" | "final") => React.ReactNode;
}) {
  if (champion) {
    // The champion's run: its tie in each round, R32 → Final.
    const rounds: Round[] = ["R32", "R16", "QF", "SF", "Final"];
    return (
      <div className="space-y-3">
        <p className="text-xs text-secondary">{champion}&apos;s run to the title. Tap any tie to change it.</p>
        {rounds.map((r) => {
          const id = ROUND_IDS[r].find((mid) => picks[FINAL_ID] && onChampPath(mid, picks, champion));
          if (!id) return null;
          return (
            <div key={r}>
              <div className="mb-1 text-[10px] font-semibold tracking-wider text-muted uppercase">
                {ROUND_LABEL[r]}
              </div>
              {cell(id, r === "Final" ? "final" : "sm")}
            </div>
          );
        })}
      </div>
    );
  }

  // No champion yet → guide the user to the next undecided round.
  const r = activeRound(picks);
  return (
    <div>
      <p className="mb-3 text-xs text-secondary">
        Pick through to the Final to crown your champion. Up next:
      </p>
      <RoundView round={r} cell={cell} />
    </div>
  );
}

function onChampPath(matchId: string, picks: Record<string, string>, champion: string): boolean {
  // A match is on the champion's path iff the champion won it (its pick is the champion).
  return picks[matchId] === champion;
}

function RoundView({
  round,
  cell,
}: {
  round: Round;
  cell: (id: string, v?: "sm" | "final") => React.ReactNode;
}) {
  const ids = ROUND_IDS[round];
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-fg">{ROUND_LABEL[round]}</h3>
      <div className="space-y-2.5">
        {ids.map((id) => cell(id, round === "Final" ? "final" : "sm"))}
      </div>
    </div>
  );
}
