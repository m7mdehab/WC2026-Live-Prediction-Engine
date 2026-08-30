"use client";

import { useState } from "react";
import { cn, simPct } from "@/lib/utils";
import type { TeamForecast } from "@/lib/types/teams";

// Ported (re-created) from feature/page-dashboards components/dashboard/teams/Gauntlet.tsx for the
// Wave-6 team page. Round-qualification trajectory island: reads only the forecast fields that
// exist on TeamForecast and is fully fail-soft.

/** Effectively-zero threshold: Monte-Carlo zeroes are exact 0.0, so this only trips on a team the
 *  simulation never advances (eliminated), never on a live minnow's tiny-but-real odds. */
const EPS = 1e-9;

type StageKey = "qf" | "sf" | "final";

interface StageDef {
  key: StageKey;
  label: string;
  p: number | null;
  next: number | null;
  nextLabel: string;
  color: string; // an existing round token, never a raw colour
}

/** Team-profile strip "The Gauntlet" (client island): a stage-probability funnel over the forecast
 *  fields that EXIST (reachQf -> reachSf -> reachFinal -> champion; there is no reach-R16 field).
 *  Segment heights are proportional to probability, coloured by the round tokens (--violet QF,
 *  --rose SF, --gold Final, --gold-strong champion). Tapping a stage fills the reserved-height
 *  readout with the CONDITIONAL probability of advancing to the next stage (next/current, clamped
 *  to [0,1], guarded against a ~0 denominator).
 *
 *  Fail-soft: forecast null (or every stage field null) -> nothing. An eliminated team (all stage
 *  probs ~0) -> a compact "Eliminated" state in the --down pairing instead of an empty funnel. */
export function Gauntlet({ team, forecast }: { team: string; forecast: TeamForecast | null }) {
  const [sel, setSel] = useState<StageKey>("qf");
  if (!forecast) return null;
  const { reachQf, reachSf, reachFinal, champion } = forecast;
  const probs = [reachQf, reachSf, reachFinal, champion];
  if (probs.every((v) => v == null)) return null;

  if (probs.every((v) => (v ?? 0) < EPS)) {
    return (
      <section
        aria-label="Stage funnel"
        data-dash-strip="team-gauntlet"
        className="mb-5 flex h-16 items-center gap-2.5 rounded-card border border-border bg-surface px-3 shadow-[var(--shadow-card)]"
      >
        <span className="rounded-full bg-down-bg px-2 py-0.5 text-[11px] font-semibold tracking-wide text-down uppercase">
          Eliminated
        </span>
        <span className="text-xs text-muted">out of title contention</span>
      </section>
    );
  }

  const stages: StageDef[] = [
    { key: "qf", label: "QF", p: reachQf, next: reachSf, nextLabel: "SF", color: "var(--violet)" },
    { key: "sf", label: "SF", p: reachSf, next: reachFinal, nextLabel: "Final", color: "var(--rose)" },
    { key: "final", label: "Final", p: reachFinal, next: champion, nextLabel: "Champion", color: "var(--gold)" },
  ];
  const maxP = Math.max(...probs.map((v) => v ?? 0), EPS);
  const heightPct = (p: number | null) => `${(Math.max(0, p ?? 0) / maxP) * 100}%`;

  const selStage = stages.find((s) => s.key === sel) ?? stages[0];
  // Conditional advance rate from the selected stage: next/current, clamped to [0,1]; a ~0
  // denominator (or a missing field) has no defined conditional, shown as the bare null glyph.
  const cond =
    selStage.p != null && selStage.p >= EPS && selStage.next != null
      ? Math.min(1, Math.max(0, selStage.next / selStage.p))
      : null;

  const column = (bar: React.ReactNode, label: string, p: number | null) => (
    <>
      <span className="flex min-h-0 w-full flex-1 items-end">{bar}</span>
      <span className="mt-1 text-[10px] font-semibold tracking-wide text-secondary uppercase">
        {label}
      </span>
      <span className="tnum text-xs font-semibold text-fg">{p == null ? "-" : simPct(p)}</span>
    </>
  );

  return (
    <section
      aria-label="Stage funnel"
      data-dash-strip="team-gauntlet"
      className="mb-5 flex h-[164px] flex-col overflow-hidden rounded-card border border-border bg-surface p-3 shadow-[var(--shadow-card)]"
    >
      <span className="h-4 truncate font-display text-[11px] font-semibold tracking-wide text-secondary uppercase">
        The gauntlet
      </span>

      <div className="mt-2 flex min-h-0 flex-1 items-stretch gap-2">
        <div role="tablist" aria-label={`${team} knockout stages`} className="flex min-w-0 flex-[3] items-stretch gap-2">
          {stages.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              id={`gauntlet-tab-${s.key}`}
              aria-selected={sel === s.key}
              aria-controls="gauntlet-readout"
              onClick={() => setSel(s.key)}
              className={cn(
                "flex min-w-0 flex-1 flex-col items-center rounded-md px-1 pt-0.5 pb-1 transition",
                sel === s.key ? "bg-elevated" : "hover:bg-bg-subtle",
              )}
            >
              {column(
                <span
                  className="block w-full rounded-t-sm"
                  style={{
                    background: s.color,
                    height: heightPct(s.p),
                    minHeight: (s.p ?? 0) >= EPS ? 2 : 0,
                  }}
                />,
                s.label,
                s.p,
              )}
            </button>
          ))}
        </div>
        {/* terminal champion segment: not a stage to advance FROM, so it is not a tab */}
        <div className="flex min-w-0 flex-1 flex-col items-center px-1 pt-0.5 pb-1">
          {column(
            <span
              className="block w-full rounded-t-sm"
              style={{
                background: "var(--gold-strong)",
                height: heightPct(champion),
                minHeight: (champion ?? 0) >= EPS ? 2 : 0,
              }}
            />,
            "Champ",
            champion,
          )}
        </div>
      </div>

      {/* reserved-height conditional readout (zero CLS on stage taps) */}
      <div
        id="gauntlet-readout"
        role="tabpanel"
        aria-labelledby={`gauntlet-tab-${selStage.key}`}
        className="mt-2 flex h-5 items-center gap-2 text-xs"
      >
        <span className="font-medium text-secondary">
          {selStage.label} {"->"} {selStage.nextLabel}
        </span>
        <span className="tnum font-semibold text-fg">{cond == null ? "-" : simPct(cond)}</span>
      </div>
    </section>
  );
}
