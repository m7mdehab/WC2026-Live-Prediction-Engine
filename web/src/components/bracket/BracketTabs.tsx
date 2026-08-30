"use client";

import { useState } from "react";
import { BracketFlow } from "@/components/bracket/BracketFlow";
import { DesktopBracket } from "@/components/bracket/DesktopBracket";
import { cn } from "@/lib/utils";
import type { ProjectedBracket } from "@/lib/types";

// The bracket DATA SOURCE toggle. Two tabs only:
//   current  -> the live/current projected bracket (resolves qualified teams as results land); once the
//               tournament is SETTLED this IS the actual final bracket, so it is labelled "Final".
//   initial  -> the FROZEN pre-tournament (cond0) projection; always a projection, labelled
//               "Pre-tournament" when settled.
// LIVE labels "Current"/"Initial" mirror the dual projection card's "Current pick"/"Initial pick"
// vocabulary. SETTLED labels "Final"/"Pre-tournament" give the toggle a referent once "current" is a
// fact rather than a live bar (the live-tense "Current"/"Initial" had none post-tournament).
//
// A future third tab is a trivial one-line addition here: append
//   { key: "your", live: "Your pick", settled: "Your pick" }
// and supply a `yourPick` bracket prop + a branch in `active`. NOT rendered now (no placeholder,
// no auth) - the array literal stays two entries.
//
// The tabs use role="tab" + aria-selected (NOT aria-pressed): the 390px layout guard asserts
// `document.querySelectorAll("[aria-pressed]").length === 0` on /forecast (no round tab bar), so a
// pill control built on aria-pressed would red that assertion. role="tab"/aria-selected sidesteps it.
const TABS = [
  { key: "current", live: "Current", settled: "Final" },
  { key: "initial", live: "Initial", settled: "Pre-tournament" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

const tabBtn = (active: boolean) =>
  cn(
    "rounded-full px-3 py-1 text-xs font-medium transition",
    active
      ? "bg-confident text-white"
      : "bg-elevated text-secondary hover:text-fg",
  );

function ready(b: ProjectedBracket | null): boolean {
  return !!b && Object.keys(b.matches).length > 0;
}

/** BRACKET TABS: a tab toggle above the projected bracket that switches the bracket DATA SOURCE
 *  between the live/current bracket and the frozen pre-tournament bracket. The SAME two viewport
 *  blocks the page used (a `hidden xl:block` DesktopBracket breakout + a `xl:hidden` BracketFlow)
 *  render under whichever tab is selected, so mobile AND desktop share the toggle. DEFAULT is the
 *  Current tab; the Current tab NEVER depends on `initial` being present. */
export function BracketTabs({
  current,
  initial,
  complete = false,
}: {
  current: ProjectedBracket | null;
  initial: ProjectedBracket | null;
  /** Tournament SETTLED: relabel the live-tense tabs to referential "Final"/"Pre-tournament", and mark
   *  the CURRENT tab's champion node as a fact (no title % / "to win"). The initial tab is always a
   *  projection, so it keeps "Projected champion" even when settled. */
  complete?: boolean;
}) {
  const [tab, setTab] = useState<TabKey>("current");
  const active = tab === "current" ? current : initial;
  // SETTLED applies ONLY to the current tab: it is the actual final bracket (a fact). The initial tab is
  // the frozen pre-tournament projection at any time, so its champion node stays a projection.
  const championSettled = complete && tab === "current";

  return (
    <div data-bracket-tabs data-complete={complete ? "" : undefined}>
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Bracket source">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            className={tabBtn(tab === t.key)}
            onClick={() => setTab(t.key)}
          >
            {complete ? t.settled : t.live}
          </button>
        ))}
      </div>

      {ready(active) ? (
        <>
          {/* Desktop bracket: breaks out of the 1280 content cap to a wider, capped container so
              the whole 9-column bracket shows without internal scroll on a typical desktop. The
              AppFrame root has overflow-x-clip so the 100vw breakout never adds page h-scroll;
              DesktopBracket keeps its own overflow-x-auto for genuinely narrow windows. */}
          <div className="hidden xl:block">
            <div className="mx-[calc(50%-50vw)] w-screen">
              <div className="mx-auto max-w-[1840px] px-4 md:px-6">
                <DesktopBracket bracket={active!} nationFill championSettled={championSettled} />
              </div>
            </div>
          </div>

          {/* Below xl: ONE vertical, collapsible flowchart of the whole projected knockout bracket
              (the full 9-column desktop bracket stops being readable under ~1280; see docs §4C.2.1). */}
          <div className="xl:hidden">
            <BracketFlow bracket={active!} championSettled={championSettled} />
          </div>
        </>
      ) : (
        // Graceful per-tab fallback. The Initial tab's frozen-bracket-unavailable message mirrors
        // DualProjectionCard's UnavailableHalf ("Pre-tournament bracket unavailable."); Current shows
        // the page's original "No projected bracket published yet." copy.
        <div>
          <h2 className="font-display text-xl font-bold text-fg xl:text-2xl">Projected Bracket</h2>
          <p className="mt-2 text-sm text-secondary">
            {tab === "initial"
              ? "Pre-tournament bracket unavailable."
              : "No projected bracket published yet."}
          </p>
        </div>
      )}
    </div>
  );
}
