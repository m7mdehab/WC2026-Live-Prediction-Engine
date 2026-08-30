"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { GroupStandings } from "@/components/predict/GroupStandings";
import { KnockoutPicker } from "@/components/predict/KnockoutPicker";
import { Confirmation } from "@/components/predict/Confirmation";
import { cn } from "@/lib/utils";
import {
  buildFieldSnapshot,
  championOf,
  isKnockoutComplete,
  pruneInvalidPicks,
} from "@/lib/types/brackets";
import type { PredictOptions, BracketSubmission, SubmitResponse, GroupStanding } from "@/lib/types/brackets";

function Field({
  label,
  htmlFor,
  required,
  error,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
        {label}
        {required ? <span className="text-down"> *</span> : <span className="text-muted"> (optional)</span>}
      </label>
      {hint ? <p className="mt-0.5 text-xs text-muted">{hint}</p> : null}
      <div className="mt-1">{children}</div>
      {error ? <p className="mt-1 text-xs text-down">{error}</p> : null}
    </div>
  );
}

const inputCls =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-fg placeholder:text-muted " +
  "focus:border-confident focus:outline-none focus:ring-2 focus:ring-confident/30";

export function PredictForm({
  options,
  comparisonAnchor,
}: {
  options: PredictOptions;
  /** In-page anchor of the AI-vs-Humans comparison below the picker (e.g. "#ai-vs-humans"). */
  comparisonAnchor?: string;
}) {
  const { groups, runModelVersion, runId, seeding } = options;

  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [linkedin, setLinkedin] = useState("");
  // group_code -> ordered [1st, 2nd, 3rd] (length 0–3). A group is "ranked" once all three are set.
  const [standings, setStandings] = useState<Record<string, string[]>>({});
  const [picks, setPicks] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState(false);

  // The complete standings (only groups with a full 1st/2nd/3rd), shaped for the field builder + payload.
  const completeStandings = useMemo(() => {
    const out: Record<string, GroupStanding> = {};
    for (const g of groups) {
      const r = standings[g.group_code];
      if (r && r.length === 3) out[g.group_code] = { first: r[0], second: r[1], third: r[2] };
    }
    return out;
  }, [standings, groups]);
  const allGroupsRanked =
    groups.length > 0 && Object.keys(completeStandings).length === groups.length;

  // The seeded R32 field (§2.5), recomputed whenever the standings change. Null until all 12 groups
  // are fully ranked (or if no projection is published) - the knockout picker stays hidden until then.
  const field = useMemo(
    () => (seeding && allGroupsRanked ? buildFieldSnapshot(completeStandings, seeding, runId ?? "") : null),
    [seeding, allGroupsRanked, completeStandings, runId]
  );
  const r32Slots = field?.r32_slots ?? null;

  const champion = championOf(picks);
  const knockoutComplete = !!r32Slots && isKnockoutComplete(picks);
  const complete = displayName.trim().length > 0 && allGroupsRanked && knockoutComplete;

  // Auto-advance: when the 12th group is fully ranked, scroll the (now-seeded) knockout bracket into
  // view. Latches once so later edits don't yank the page around; re-armed on reset().
  const koSectionRef = useRef<HTMLDivElement>(null);
  const advancedRef = useRef(false);
  useEffect(() => {
    if (allGroupsRanked && !advancedRef.current) {
      advancedRef.current = true;
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      koSectionRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    }
  }, [allGroupsRanked]);

  const invalidGroups = useMemo(
    () =>
      new Set(
        Object.keys(fieldErrors)
          .filter((k) => k.startsWith("group_"))
          .map((k) => k.slice("group_".length))
      ),
    [fieldErrors]
  );

  function clearError(key: string) {
    setFieldErrors((e) => {
      if (!e[key]) return e;
      const next = { ...e };
      delete next[key];
      return next;
    });
  }

  function rankGroup(groupCode: string, nextRanked: string[]) {
    setStandings((s) => ({ ...s, [groupCode]: nextRanked }));
    clearError(`group_${groupCode}`);
    setTopError(null);
    // A changed ranking reshapes the R32 field → prune any knockout pick no longer valid. Only
    // possible once all 12 groups are fully ranked (the field is null otherwise - picker hidden).
    if (seeding) {
      const cs: Record<string, GroupStanding> = {};
      for (const g of groups) {
        const r = g.group_code === groupCode ? nextRanked : standings[g.group_code];
        if (r && r.length === 3) cs[g.group_code] = { first: r[0], second: r[1], third: r[2] };
      }
      if (Object.keys(cs).length === groups.length) {
        const f = buildFieldSnapshot(cs, seeding, runId ?? "");
        if (f) setPicks((p) => pruneInvalidPicks(p, f.r32_slots));
      }
    }
  }

  function pickKnockout(matchId: string, team: string) {
    if (!r32Slots) return;
    setPicks((p) => pruneInvalidPicks({ ...p, [matchId]: team }, r32Slots));
    setTopError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting || !complete) return;
    setSubmitting(true);
    setTopError(null);
    setFieldErrors({});

    const payload: BracketSubmission = {
      display_name: displayName.trim(),
      email: email.trim() || null,
      consent_to_updates: consent,
      linkedin_url: linkedin.trim() || null,
      champion_pick: champion ?? "",
      group_standings: completeStandings,
      knockout_picks: picks,
    };

    try {
      const res = await fetch("/api/predict", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as SubmitResponse;
      if (data.ok) {
        setDone(true);
        if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        setTopError(data.error);
        setFieldErrors(data.fields ?? {});
      }
    } catch {
      setTopError("Network error. Please check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setDisplayName("");
    setEmail("");
    setConsent(false);
    setLinkedin("");
    setStandings({});
    setPicks({});
    setTopError(null);
    setFieldErrors({});
    setDone(false);
    advancedRef.current = false; // re-arm auto-advance for the next entry
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (done && r32Slots && champion) {
    return (
      <Confirmation
        displayName={displayName.trim()}
        champion={champion}
        groups={groups}
        standings={completeStandings}
        r32Slots={r32Slots}
        picks={picks}
        emailed={email.trim().length > 0 && consent}
        onReset={reset}
      />
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <header className="mb-5">
        <h1 className="font-display text-2xl font-bold text-fg">Predict the bracket</h1>
        <p className="mt-1 text-sm text-secondary">
          Rank the top three in each group, then tap your way through the knockouts to crown a
          champion, and see how you stack up against the model.
        </p>
        <p className="mt-1 text-xs text-muted">
          Pitted against the model&apos;s{" "}
          <Link href="/forecast#bracket" className="text-confident hover:underline">
            current projected bracket
          </Link>
          {runModelVersion ? ` (${runModelVersion})` : ""}.
        </p>
        {comparisonAnchor ? (
          <p className="mt-1 text-xs">
            <a href={comparisonAnchor} className="font-medium text-confident hover:underline">
              See how everyone&apos;s brackets compare ↑
            </a>
          </p>
        ) : null}
      </header>

      {!seeding ? (
        <div className="rounded-card border border-border bg-surface p-4 text-sm text-secondary">
          The bracket picker needs a published model projection, which isn&apos;t available right now.
          Please check back shortly.
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-7">
          {/* 1 - group standings (rank 1st / 2nd / 3rd) */}
          <GroupStandings
            groups={groups}
            standings={standings}
            invalidGroups={invalidGroups}
            onRank={rankGroup}
          />

          {/* 2 - knockout picker (unlocks once all 12 groups are fully ranked) */}
          <div ref={koSectionRef}>
            {r32Slots ? (
              <KnockoutPicker r32Slots={r32Slots} picks={picks} onPick={pickKnockout} />
            ) : (
              <section className="rounded-card border border-dashed border-border-strong bg-bg-subtle p-4 text-sm text-secondary">
                <h2 className="font-display text-base font-semibold text-fg">Knockout bracket</h2>
                <p className="mt-1 text-xs text-muted">
                  Rank all {groups.length} groups above to seed the Round of 32 and start tapping
                  through the knockouts.
                </p>
              </section>
            )}
          </div>

          {/* 3 - identity */}
          <section className="rounded-card border border-border bg-surface p-4">
            <h2 className="mb-3 font-display text-base font-semibold text-fg">Your entry</h2>
            <div className="space-y-4">
              <Field
                label="Display name"
                htmlFor="display_name"
                required
                error={fieldErrors.display_name}
                hint="Shown on the leaderboard, and must be unique. A handle like yourname7 works well."
              >
                <input
                  id="display_name"
                  type="text"
                  value={displayName}
                  onChange={(e) => {
                    setDisplayName(e.target.value);
                    clearError("display_name");
                  }}
                  maxLength={80}
                  autoComplete="nickname"
                  placeholder="e.g. sam7"
                  className={cn(inputCls, fieldErrors.display_name && "border-down")}
                />
              </Field>

              <Field label="Email" htmlFor="email" error={fieldErrors.email}>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearError("email");
                  }}
                  maxLength={254}
                  autoComplete="email"
                  placeholder="you@example.com"
                  className={cn(inputCls, fieldErrors.email && "border-down")}
                />
              </Field>

              <label
                className={cn(
                  "flex items-start gap-2.5 text-sm",
                  email.trim() ? "text-secondary" : "text-muted"
                )}
              >
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={!email.trim()}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--confident)] disabled:opacity-50"
                />
                <span>
                  Email me model updates and how my bracket is doing.
                  {!email.trim() ? " Add an email above to enable." : ""}
                </span>
              </label>

              <Field
                label="LinkedIn"
                htmlFor="linkedin_url"
                error={fieldErrors.linkedin_url}
                hint="Profile URL, if you'd like to be tagged in the launch post."
              >
                <input
                  id="linkedin_url"
                  type="url"
                  value={linkedin}
                  onChange={(e) => {
                    setLinkedin(e.target.value);
                    clearError("linkedin_url");
                  }}
                  maxLength={200}
                  inputMode="url"
                  placeholder="https://www.linkedin.com/in/…"
                  className={cn(inputCls, fieldErrors.linkedin_url && "border-down")}
                />
              </Field>
            </div>
          </section>

          {topError ? (
            <div role="alert" className="rounded-md border border-down bg-down-bg px-3 py-2 text-sm text-down">
              {topError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={!complete || submitting}
              className={cn(
                "rounded-md px-5 py-2.5 text-sm font-semibold text-inverse transition-colors",
                "bg-confident hover:bg-confident/90",
                "disabled:cursor-not-allowed disabled:bg-muted disabled:text-inverse/80"
              )}
            >
              {submitting ? "Submitting…" : "Submit my bracket"}
            </button>
            {!complete ? (
              <span className="text-xs text-muted">
                {!allGroupsRanked
                  ? `Rank 1st, 2nd and 3rd in all ${groups.length} groups to continue.`
                  : !knockoutComplete
                    ? "Tap through every knockout tie to the Final."
                    : "Add a display name to submit."}
              </span>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
