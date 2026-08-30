"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import schedule from "@/lib/data/schedule_2026.json";
import { DidYouKnow } from "@/components/home/DidYouKnow";
import { NextMatchView } from "@/components/home/NextMatchView";
import type { NextMatchCard } from "@/lib/data/nextMatch";

// ---------------------------------------------------------------------------------------------------
// Milestones, derived deterministically (no Date.now) from the SAME canonical schedule /matches and
// /daily read (web/src/lib/data/schedule_2026.json, the fixtures mirror). Each milestone = the
// earliest kickoff of its round. Module-level + pure so the server and first client render agree.
// ---------------------------------------------------------------------------------------------------
type Sched = { stage: string; kickoff_utc: string | null }[];
// [full label, schedule stage, short code (mobile)]
const STAGES: [string, string, string][] = [
  ["Kick-off", "group", "Kick-off"],
  ["Round of 32", "round_of_32", "R32"],
  ["Round of 16", "round_of_16", "R16"],
  ["Quarter-finals", "quarter_finals", "QF"],
  ["Semi-finals", "semi_finals", "SF"],
  ["Final", "final", "Final"],
];
const MILESTONES = STAGES.map(([label, stage, short]) => {
  const iso = (schedule as Sched)
    .filter((r) => r.stage === stage && r.kickoff_utc)
    .map((r) => r.kickoff_utc as string)
    .sort()[0];
  return { label, short, iso, t: Date.parse(iso) };
});
const N = MILESTONES.length;

// metallic gold gradients (light → deep sheen, never one flat tone)
const STRIPE = "linear-gradient(90deg, var(--metal-gold-deep), var(--metal-gold), var(--metal-gold-light), var(--metal-gold), var(--metal-gold-deep))";
const TRAIL = "linear-gradient(90deg, var(--metal-gold-deep), var(--metal-gold))";
const ACTIVE_NODE = "linear-gradient(135deg, var(--metal-gold-light), var(--metal-gold), var(--metal-gold-deep))";
const SHEEN = "linear-gradient(90deg, transparent, var(--metal-gold), transparent)";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function remaining(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { dd: Math.floor(s / 86400), hh: Math.floor((s % 86400) / 3600),
    mm: Math.floor((s % 3600) / 60), ss: s % 60 };
}
/** First milestone strictly in the future, or -1 once the Final has passed. */
function activeIndex(now: number) {
  for (let i = 0; i < N; i++) if (MILESTONES[i].t > now) return i;
  return -1;
}
/** Live ball position as a fraction [0,1] across the N evenly-spaced nodes. Continuous: the ball
 *  reaches node `idx` exactly as the timer to it hits zero. Pre-kickoff it rests at node 0. */
function liveFrac(now: number) {
  const idx = activeIndex(now);
  if (idx <= 0) return idx === 0 ? 0 : 1; // pre-kickoff at start; all done at end
  const prev = MILESTONES[idx - 1], cur = MILESTONES[idx];
  const seg = Math.min(1, Math.max(0, (now - prev.t) / (cur.t - prev.t)));
  return (idx - 1 + seg) / (N - 1);
}
const nodeFrac = (i: number) => i / (N - 1);

/** A truncated-icosahedron football drawn to read at 22px: white sphere with a navy outline, a
 *  central black pentagon, five black rim pentagons (half outside the sphere, clipped to it) in
 *  the gaps between five radial seam lines that run from the central pentagon's vertices to the
 *  rim. Spin is pure CSS on the <svg> (continuous clockwise, 2.5s/turn, linear, infinite), gated
 *  behind `@media (prefers-reduced-motion: no-preference)` - reduced-motion users get a static
 *  ball. Position along the track is the parent's job and stays live either way. */
function SoccerBall({ size }: { size: number }) {
  const clipId = useId();
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="wc-ball-spin">
      <defs>
        <clipPath id={clipId}>
          <circle cx="16" cy="16" r="14.2" />
        </clipPath>
      </defs>
      {/* hex-guard-ok: fixed soccer-ball illustration art (white sphere, navy seams); a fixed image like marks.tsx / Flag.tsx, not a themed color. */}
      <circle cx="16" cy="16" r="15" fill="#fff" stroke="#0a0f1e" strokeWidth="1.6" />
      <g clipPath={`url(#${clipId})`}>
        {/* radial seams, central-pentagon vertex → rim (between the rim pentagons) */}
        {/* hex-guard-ok: fixed soccer-ball illustration art (white sphere, navy seams); a fixed image like marks.tsx / Flag.tsx, not a themed color. */}
        <g stroke="#0a0f1e" strokeWidth="1.4" strokeLinecap="round">
          <line x1="16" y1="10.6" x2="16" y2="1" />
          <line x1="21.14" y1="14.33" x2="30.27" y2="11.36" />
          <line x1="19.17" y1="20.37" x2="24.82" y2="28.14" />
          <line x1="12.83" y1="20.37" x2="7.18" y2="28.14" />
          <line x1="10.86" y1="14.33" x2="1.73" y2="11.36" />
        </g>
        {/* five rim pentagons, clipped to the sphere */}
        {/* hex-guard-ok: fixed soccer-ball illustration art (white sphere, navy seams); a fixed image like marks.tsx / Flag.tsx, not a themed color. */}
        <g fill="#0a0f1e">
          <polygon points="21.35,8.64 19.64,3.38 24.11,0.14 28.58,3.38 26.87,8.64" />
          <polygon points="24.65,18.81 29.12,15.56 33.59,18.81 31.89,24.07 26.36,24.07" />
          <polygon points="16,25.1 20.47,28.35 18.76,33.6 13.24,33.6 11.53,28.35" />
          <polygon points="7.35,18.81 5.64,24.07 0.11,24.07 -1.59,18.81 2.88,15.56" />
          <polygon points="10.65,8.64 5.13,8.64 3.42,3.38 7.89,0.14 12.36,3.38" />
        </g>
      </g>
      {/* central pentagon */}
      {/* hex-guard-ok: fixed soccer-ball illustration art (white sphere, navy seams); a fixed image like marks.tsx / Flag.tsx, not a themed color. */}
      <polygon
        fill="#0a0f1e"
        points="16,10.6 21.14,14.33 19.17,20.37 12.83,20.37 10.86,14.33"
      />
    </svg>
  );
}

export function CountdownHero({
  nextMatch = null,
  complete = false,
}: { nextMatch?: NextMatchCard | null; complete?: boolean } = {}) {
  // null until mounted → stable, deterministic SSR frame (no Date.now on the server).
  const [now, setNow] = useState<number | null>(null);
  const [preview, setPreview] = useState<number | null>(null);
  const [easing, setEasing] = useState(false);
  const [reduced, setReduced] = useState(false);
  // Countdown target mode. "stage" (default) counts to the next round; "match" counts to the next
  // scheduled fixture's kickoff. The toggle only appears when a next match exists (fail-soft), and the
  // default is always "stage" so SSR and the first client render agree (no hydration shift).
  const [mode, setMode] = useState<"stage" | "match">("stage");
  const easeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canToggle = nextMatch != null;
  const matchMode = canToggle && mode === "match";

  useEffect(() => {
    // client-mount: start live updates here (stable SSR frame above). Intentional setState-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setNow(Date.now());
    // Settled tournament: the hero is a COMPLETED timeline, not a live counter - no per-second tick.
    if (complete) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [complete]);

  // auto-ease back to live ~10s after a preview tap
  useEffect(() => {
    if (preview === null) return;
    const id = setTimeout(() => clearPreview(), 10000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview]);

  function clearPreview() {
    setPreview(null);
    if (!reduced) {
      setEasing(true);
      if (easeTimer.current) clearTimeout(easeTimer.current);
      easeTimer.current = setTimeout(() => setEasing(false), 850);
    }
  }
  function tapNode(i: number) {
    const liveIdx = now === null ? 0 : activeIndex(now);
    if (i === liveIdx || i === preview) clearPreview();
    else setPreview(i);
  }
  function selectMode(next: "stage" | "match") {
    if (next === mode) return;
    setPreview(null); // leaving stage: drop any node preview so it eases back clean on return
    setMode(next);
  }

  const mounted = now !== null;
  const liveIdx = mounted ? activeIndex(now) : 0;
  const targetIdx = preview ?? (liveIdx === -1 ? N - 1 : liveIdx);
  const target = MILESTONES[targetIdx];
  // In "next match" mode the digits count to the fixture's kickoff; otherwise to the stage milestone.
  const matchKickoffT = matchMode ? Date.parse(nextMatch!.kickoffUtc ?? "") : NaN;
  const countdownT = matchMode && Number.isFinite(matchKickoffT) ? matchKickoffT : target.t;
  const rem = remaining(mounted ? countdownT - (now as number) : 0);

  // heading is LIVE-stage aware (ignores preview, so tapping a node never rewrites the title). Once
  // the tournament is complete the hero is a settled, past-tense timeline, never a countdown.
  const heading =
    complete ? "World Cup 2026 - every stage played"
    : matchMode ? "Next match"
    : !mounted || liveIdx === 0 ? "Countdown to kick-off"
    : liveIdx === -1 ? "World Cup 2026"
    : `Countdown to the ${MILESTONES[liveIdx].label}`;

  // ball position: preview → that node; live → continuous frac. CSS transition only for preview /
  // ease-back (and never under reduced-motion); the live creep is pure per-tick recompute.
  // Spin is decoupled from position entirely - a continuous CSS rotation on the ball itself
  // (see the wc-ball-spin keyframes below), so it no longer derives from track progress.
  const frac = preview !== null ? nodeFrac(preview) : mounted ? liveFrac(now as number) : 0;
  const useTransition = !reduced && (preview !== null || easing);
  const previewing = preview !== null;

  // Settled tournament: the rail is a COMPLETED timeline - every node ticked, the ball at the Final -
  // computed WITHOUT `now` so the server frame already shows the finished state (no start->done flash).
  const railFrac = complete ? 1 : frac;
  const railLiveIdx = complete ? -1 : liveIdx;
  const nodePassed = (m: (typeof MILESTONES)[number]) => complete || (mounted && m.t <= (now as number));

  const fmtDate = (iso: string) =>
    new Intl.DateTimeFormat(mounted ? undefined : "en-GB", {
      day: "numeric", month: "short", ...(mounted ? {} : { timeZone: "UTC" }),
    }).format(new Date(iso));

  const tiles: [string, string][] = [
    [pad2(rem.dd), "Days"], [pad2(rem.hh), "Hrs"], [pad2(rem.mm), "Min"], [pad2(rem.ss), "Sec"],
  ];

  return (
    <section data-hero-countdown data-hero-settled={complete ? "" : undefined} className="relative overflow-hidden rounded-3xl border border-border bg-surface p-5 text-center shadow-[var(--shadow-card)] sm:p-8">
      {/* continuous clockwise ball spin, CSS-only and gated so prefers-reduced-motion users get a
          static ball (the position on the track still updates either way) */}
      <style>{`
        @keyframes wc-ball-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: no-preference) {
          .wc-ball-spin { animation: wc-ball-spin 2.5s linear infinite; }
        }
      `}</style>
      {/* metallic gold top stripe */}
      <div aria-hidden className="absolute inset-x-0 top-0 h-1" style={{ background: STRIPE }} />

      <p className="text-[11px] font-semibold tracking-[0.15em] text-gold-strong uppercase">
        June 11 – July 19, 2026 · United States · Canada · Mexico
      </p>
      <h2 className="mt-2 font-display text-2xl font-bold text-fg sm:text-4xl">{heading}</h2>
      <p className="mx-auto mt-1 max-w-prose text-sm leading-relaxed text-secondary">
        {complete
          ? "48 nations, 104 matches, one champion. The road from kick-off to the Final, complete."
          : (
            <>
              48 nations, 104 matches, only one nation to go back home with the cup.
              <br />
              Track the time to every stage of World Cup 2026.
            </>
          )}
      </p>

      {/* primary conversion CTA. Live: the beat-the-AI hook -> the bracket picker. Settled: the game is
          over, so it points at the finished AI-vs-humans result instead of a closed picker. */}
      <div className="mt-5 flex flex-col items-center gap-2">
        {complete ? (
          <>
            <p className="text-sm font-semibold text-fg">See how the AI stacked up against the humans.</p>
            <Link
              href="#ai-vs-humans"
              className="group inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-semibold text-on-gold shadow-[var(--shadow-card)] transition-colors hover:bg-gold-strong sm:text-base"
            >
              See the final scores
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-fg">Think you can beat the AI?</p>
            <Link
              href="/predict"
              className="group inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-semibold text-on-gold shadow-[var(--shadow-card)] transition-colors hover:bg-gold-strong sm:text-base"
            >
              Make your picks
              <span className="transition-transform group-hover:translate-x-0.5">→</span>
            </Link>
          </>
        )}
      </div>

      {/* ---- countdown-mode toggle: "next stage" (default) vs "next match" (shown only when a next
          match exists; hidden entirely otherwise so the card is never broken) ---- */}
      {canToggle ? (
        <div className="mt-5 flex justify-center">
          <div
            data-hero-toggle
            role="group"
            aria-label="Countdown mode"
            className="inline-flex rounded-full border border-gold-line bg-surface p-0.5"
          >
            {(["stage", "match"] as const).map((m) => {
              const active = m === "match" ? matchMode : !matchMode;
              return (
                <button
                  key={m}
                  type="button"
                  data-hero-mode={m}
                  aria-pressed={active}
                  onClick={() => selectMode(m)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                    active ? "bg-gold text-on-gold" : "text-secondary hover:text-fg"
                  }`}
                >
                  {m === "match" ? "Next match" : "Next stage"}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* The live counter (timer label + Live/Preview pill + the Days/Hrs/Min/Sec digit cluster + the
          sr-only live region) exists ONLY while the tournament is running. Once complete it would be a
          dead clock ticking 00:00:00:00 to a past date, so it is dropped entirely - the completed stage
          rail below carries the settled story. */}
      {!complete && (
        <>
          {/* ---- live timer ---- */}
          <div className="mt-5 flex items-center justify-center gap-2">
            <p className="text-xs font-medium tracking-wide text-secondary uppercase">
              {matchMode ? "Kick-off" : `Time to ${target.label}`}
            </p>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              previewing ? "bg-elevated text-muted" : "bg-up-bg text-up"}`}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: "currentColor" }} />
              {previewing ? "Preview" : "Live"}
            </span>
          </div>

          {/* digit cluster: white/black tiles on plain surface (gold-line border + top sheen per tile) */}
          <div className="relative mt-2 flex justify-center">
            <div data-hero-digits className="relative inline-flex items-end gap-2 sm:gap-3">
              {tiles.map(([val, lab], i) => (
                <div key={lab} className="flex items-center gap-2 sm:gap-3">
                  <div className="relative flex w-12 flex-col items-center overflow-hidden rounded-lg border border-gold-line bg-surface py-2 sm:w-16 sm:py-3">
                    <span aria-hidden className="absolute inset-x-0 top-0 h-px" style={{ background: SHEEN }} />
                    <span className="font-display text-3xl font-bold tabular-nums text-fg sm:text-4xl">
                      {mounted ? val : "--"}
                    </span>
                    <span className="mt-0.5 text-[9px] font-semibold tracking-widest text-muted uppercase sm:text-[10px]">{lab}</span>
                  </div>
                  {i < tiles.length - 1 && <span className="pb-5 text-2xl font-bold text-gold-strong sm:text-3xl">:</span>}
                </div>
              ))}
            </div>
          </div>

          {/* coarse, seconds-free live region so screen readers aren't spammed every tick */}
          <p className="sr-only" aria-live="polite">
            {!mounted
              ? ""
              : matchMode
                ? `Next match: ${nextMatch!.teamA.name} versus ${nextMatch!.teamB.name}, kick-off in ${rem.dd} days, ${rem.hh} hours, ${rem.mm} minutes.`
                : `Time to ${target.label}: ${rem.dd} days, ${rem.hh} hours, ${rem.mm} minutes.`}
          </p>
        </>
      )}

      {matchMode && nextMatch ? (
        <NextMatchView card={nextMatch} />
      ) : (
      <>
      {/* ---- timeline with rolling ball ---- */}
      <div className="relative mx-8 mt-8 mb-2 h-16 sm:mx-14 sm:mt-10">
        {/* base line + filled trail */}
        <div className="absolute top-2 right-0 left-0 h-0.5 rounded-full bg-border" />
        <div
          className="absolute top-2 left-0 h-0.5 rounded-full"
          style={{ width: `${railFrac * 100}%`, background: TRAIL, transition: useTransition ? "width 800ms ease-in-out" : "none" }}
        />
        {/* the ball */}
        <div
          className="absolute top-2 z-10 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${railFrac * 100}%`, transition: useTransition ? "left 800ms ease-in-out" : "none" }}
        >
          <span className={!reduced && railLiveIdx === 0 && preview === null ? "block animate-pulse" : "block"}>
            <SoccerBall size={22} />
          </span>
        </div>
        {/* nodes */}
        {MILESTONES.map((m, i) => {
          const passed = nodePassed(m);
          const isLive = i === railLiveIdx;
          const isSel = i === preview;
          return (
            <button
              key={m.label}
              type="button"
              onClick={() => tapNode(i)}
              aria-label={`${m.label}, ${fmtDate(m.iso)}, ${passed ? "completed" : isLive ? "next up" : "upcoming"}${isSel ? ", previewing" : ""}`}
              className="group absolute top-0 flex -translate-x-1/2 flex-col items-center focus:outline-none"
              style={{ left: `${nodeFrac(i) * 100}%` }}
            >
              <span
                className={`grid h-4 w-4 place-items-center rounded-full border-2 text-[8px] transition-colors ${
                  isLive ? "border-gold-strong text-on-gold"
                  : passed ? "border-gold-strong bg-surface text-gold-strong"
                  : "border-border bg-surface text-transparent"
                } ${isSel ? "ring-2 ring-gold-strong ring-offset-1 ring-offset-surface" : ""} group-hover:border-gold-strong`}
                style={isLive ? { background: ACTIVE_NODE } : undefined}
              >
                {passed ? "✓" : ""}
              </span>
              <span className={`mt-1 text-[9px] font-medium whitespace-nowrap sm:text-[10px] ${
                isLive ? "text-gold-strong" : passed ? "text-muted" : "text-secondary"}`}>
                <span className="sm:hidden">{m.short}</span>
                <span className="hidden sm:inline">{m.label}</span>
              </span>
              <span className="text-[8px] whitespace-nowrap tabular-nums text-muted sm:text-[9px]" suppressHydrationWarning>
                {fmtDate(m.iso)}
              </span>
            </button>
          );
        })}
      </div>

      {/* gold hairline divider, then the quiet one-line facts footnote (tight spacing) */}
      <div aria-hidden className="mt-5 h-px w-full"
        style={{ background: "linear-gradient(90deg, transparent, var(--gold-line), transparent)" }} />
      <div className="mt-3">
        <DidYouKnow />
      </div>
      </>
      )}
    </section>
  );
}
