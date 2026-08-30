"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Flag } from "@/components/ui/Flag";
import { Checkbox, Label, NumberInput, Select } from "@/components/admin/fields";
import { EventsEditor } from "@/components/admin/EventsEditor";
import { cn } from "@/lib/utils";
import type {
  AdminEntryMatch,
  AdminSubmission,
  AdminSubmitResult,
  CurrentRunSummary,
  EventInput,
} from "@/lib/types/events";

const btn =
  "inline-flex items-center justify-center rounded-md bg-confident px-5 py-2.5 text-sm " +
  "font-semibold text-white transition hover:bg-[var(--confident-hover)] disabled:opacity-50";

interface Props {
  matches: AdminEntryMatch[];
  adminEmail: string;
  preview?: boolean;
}

const STAGE_LABEL: Record<string, string> = {
  group: "Group", round_of_32: "R32", round_of_16: "R16",
  quarter_finals: "QF", semi_finals: "SF", third_place_playoff: "3rd place", final: "Final",
};

const CLI_FALLBACK = "python -m db.recalc";
const POLL_MS = 20_000;
const POLL_TIMEOUT_MS = 600_000; // 10 min

type RecalcPhase = "watching" | "published" | "timeout";

/** Confirms a triggered recalc actually published: records the run that is current right after the
 *  save, then polls GET /api/admin every ~20s until a NEW run (different run_id, newer created_at)
 *  becomes current. Truthful by construction - "published" is only shown once the new run is the
 *  one the public pages serve; after 10 min without one it says so instead of pretending. */
function RecalcWatch() {
  const [phase, setPhase] = useState<RecalcPhase>("watching");
  const [runId, setRunId] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    let baseline: CurrentRunSummary | null = null;
    let baselineKnown = false;

    async function current(): Promise<CurrentRunSummary | null> {
      const r = await fetch("/api/admin", { cache: "no-store" });
      if (!r.ok) throw new Error(`status ${r.status}`);
      const data = (await r.json()) as { ok: boolean; run: CurrentRunSummary | null };
      if (!data.ok) throw new Error("status read failed");
      return data.run;
    }

    // Baseline = the run current at submit time (a recalc takes minutes; this read takes ms).
    current()
      .then((run) => { baseline = run; baselineKnown = true; })
      .catch(() => { /* keep polling; the first successful poll sets the baseline instead */ });

    const iv = setInterval(async () => {
      try {
        const run = await current();
        if (stopped || !run) return;
        if (!baselineKnown) { baseline = run; baselineKnown = true; return; }
        const isNew = baseline == null
          || (run.run_id !== baseline.run_id && run.created_at > baseline.created_at);
        if (isNew) {
          setRunId(run.run_id);
          setPhase("published");
          stopped = true;
          clearInterval(iv);
          clearTimeout(to);
        }
      } catch {
        /* transient poll failure; try again next tick */
      }
    }, POLL_MS);
    const to = setTimeout(() => {
      if (!stopped) { setPhase("timeout"); stopped = true; clearInterval(iv); }
    }, POLL_TIMEOUT_MS);

    return () => { stopped = true; clearInterval(iv); clearTimeout(to); };
  }, []);

  if (phase === "published") {
    return (
      <p className="mt-2 flex items-center gap-2 text-xs">
        <Tag variant="up">Recalc published</Tag>
        <span className="text-secondary">run <code className="text-fg">{runId}</code></span>
      </p>
    );
  }
  if (phase === "timeout") {
    return (
      <p className="mt-2 text-xs text-down">
        Recalc not confirmed after 10 min. Check the Actions tab or run the CLI fallback:{" "}
        <code>{CLI_FALLBACK}</code>
      </p>
    );
  }
  return (
    <p className="mt-2 text-xs text-secondary">
      <span className="mr-1 inline-block animate-pulse" aria-hidden>●</span>
      Watching for the new run (checks every 20s)...
    </p>
  );
}

/** Truthful post-save status line. Three real cases: dispatch accepted (then RecalcWatch confirms
 *  the publish), dispatch failed (say so + CLI fallback), or no dispatch applies (half-time). */
function SaveStatus({ result }: { result: AdminSubmitResult }) {
  if (result.recalc?.triggered) {
    return (
      <>
        <p className="mt-2 text-xs text-secondary">
          Result live everywhere. Model recalc triggered: surfaces update in ~2-4 min.
        </p>
        <RecalcWatch />
      </>
    );
  }
  if (result.recalc) {
    return (
      <p className="mt-2 text-xs text-down">
        Result saved. Automatic recalc could NOT be triggered ({result.recalc.reason ?? "unknown error"}).
        Run the CLI fallback: <code>{CLI_FALLBACK}</code>
      </p>
    );
  }
  // no dispatch applies: half-time / non-completing save
  return (
    <p className="mt-2 text-xs text-secondary">
      Saved. Recalc is only triggered when a match is marked complete; this entry left the match
      unfinished, so the model is unchanged.
    </p>
  );
}

/** The protected manual-entry form (scope_lock §8). Select a match → enter the final score
 *  (+ optional half-time score + §8 events) → POST /api/admin. Completing a match triggers the
 *  model recalc automatically (GitHub Actions); the status card reports the dispatch truthfully
 *  and confirms when the new run is live. */
export function AdminForm({ matches, adminEmail, preview }: Props) {
  const [matchId, setMatchId] = useState("");
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [markComplete, setMarkComplete] = useState(true);
  const [winner, setWinner] = useState("");
  const [htOn, setHtOn] = useState(false);
  const [htHome, setHtHome] = useState("");
  const [htAway, setHtAway] = useState("");
  const [extraTime, setExtraTime] = useState(false);
  const [penalties, setPenalties] = useState(false);
  const [events, setEvents] = useState<EventInput[]>([]);

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AdminSubmitResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  // bumped per successful save - keys SaveStatus so a re-submit restarts the recalc watch fresh
  const [saveSeq, setSaveSeq] = useState(0);

  const match = useMemo(() => matches.find((m) => m.match_id === matchId) ?? null, [matches, matchId]);
  const teams = useMemo(
    () => (match ? [match.team_a, match.team_b].filter((t): t is string => !!t) : []),
    [match]
  );
  const isKnockout = !!match && match.stage !== "group";
  const winnerRequired = isKnockout && markComplete;

  function reset() {
    setHome(""); setAway(""); setWinner(""); setHtOn(false); setHtHome(""); setHtAway("");
    setExtraTime(false); setPenalties(false); setEvents([]); setMarkComplete(true);
  }

  function onSelectMatch(id: string) {
    setMatchId(id); setResult(null); setError(null);
    const m = matches.find((x) => x.match_id === id) ?? null;
    if (m?.result) {
      setHome(String(m.result.home_score));
      setAway(String(m.result.away_score));
      setWinner(m.result.winner_team ?? "");
      setMarkComplete(m.result.status === "completed");
      if (m.result.ht_home_score != null && m.result.ht_away_score != null) {
        setHtOn(true); setHtHome(String(m.result.ht_home_score)); setHtAway(String(m.result.ht_away_score));
      } else { setHtOn(false); setHtHome(""); setHtAway(""); }
    } else {
      reset();
    }
  }

  function validate(): string | null {
    if (!matchId) return "Select a match.";
    if (home === "" || away === "") return "Enter both final scores.";
    if (winnerRequired && !winner) return "A knockout needs a winner (ET/penalties may decide it).";
    if (htOn && (htHome === "" || htAway === "")) return "Enter both half-time scores, or turn half-time off.";
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setResult(null);
    const v = validate();
    if (v) { setError(v); return; }

    const allEvents: EventInput[] = [...events];
    if (extraTime) allEvents.push({ event_type: "extra_time", team: null, minute: null, player: null, severity: null, flag: true, note: null });
    if (penalties) allEvents.push({ event_type: "penalty_shootout", team: null, minute: null, player: null, severity: null, flag: true, note: null });

    const payload: AdminSubmission = {
      match_id: matchId,
      home_score: Number(home),
      away_score: Number(away),
      winner_team: winnerRequired ? winner : null,
      mark_complete: markComplete,
      ht_home_score: htOn && htHome !== "" ? Number(htHome) : null,
      ht_away_score: htOn && htAway !== "" ? Number(htAway) : null,
      events: allEvents,
    };

    setBusy(true);
    try {
      const r = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error ?? `Request failed (${r.status}).`);
      } else {
        setResult(data as AdminSubmitResult);
        setSaveSeq((n) => n + 1);
      }
    } catch {
      setError("Network error. The entry was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">Admin · result &amp; event entry</h1>
        <Tag variant="confident">Protected</Tag>
        {preview ? <Tag variant="upset">Local preview</Tag> : null}
      </div>
      <p className="mb-1 text-sm text-secondary">
        Signed in as <span className="font-medium text-fg">{adminEmail}</span>. Saving a result makes
        it live on every page immediately; completing a match also triggers the model recalc.
      </p>
      <p className="mb-5 flex items-start gap-2 rounded-md border border-border bg-bg-subtle px-3 py-2 text-xs text-secondary">
        <span aria-hidden>↻</span>
        <span>
          Marking a match <strong>complete</strong> auto-triggers the recalc workflow (GitHub
          Actions); a new prediction run publishes in ~2-4 min and this page confirms it. Half-time
          and event-only saves do not recalc. If the trigger fails, run the CLI fallback:{" "}
          <code className="text-fg">python&nbsp;-m&nbsp;db.recalc</code>.
        </span>
      </p>

      <form onSubmit={submit} className="space-y-4">
        {/* 1 - Match */}
        <Card>
          <CardHeader title="Match" />
          <Label htmlFor="match">Fixture</Label>
          <Select id="match" value={matchId} onChange={(e) => onSelectMatch(e.target.value)} required>
            <option value="">Select a match…</option>
            {matches.map((m) => (
              <option key={m.match_id} value={m.match_id}>
                {m.match_id} · {STAGE_LABEL[m.stage] ?? m.stage} · {m.team_a ?? "TBD"} v {m.team_b ?? "TBD"}
                {m.result ? `  (${m.result.status})` : ""}
              </option>
            ))}
          </Select>
          {match ? (
            <div className="mt-3 flex items-center justify-center gap-3 text-sm">
              <span className="flex items-center gap-2">
                <Flag team={match.team_a ?? ""} size="text-lg" />
                <span className="font-medium text-fg">{match.team_a ?? "TBD"}</span>
              </span>
              <span className="text-muted">vs</span>
              <span className="flex items-center gap-2">
                <span className="font-medium text-fg">{match.team_b ?? "TBD"}</span>
                <Flag team={match.team_b ?? ""} size="text-lg" />
              </span>
              <Tag variant="neutral">{STAGE_LABEL[match.stage] ?? match.stage}</Tag>
            </div>
          ) : null}
        </Card>

        {/* 2 - Score + completion */}
        <Card>
          <CardHeader title="Final score" />
          <div className="flex items-end justify-center gap-3">
            <div className="w-24">
              <Label htmlFor="home">{match?.team_a ?? "Home"}</Label>
              <NumberInput id="home" min={0} max={30} value={home} placeholder="0"
                className="text-center text-lg" onChange={(e) => setHome(e.target.value)} />
            </div>
            <span className="pb-2 text-lg text-muted">–</span>
            <div className="w-24">
              <Label htmlFor="away">{match?.team_b ?? "Away"}</Label>
              <NumberInput id="away" min={0} max={30} value={away} placeholder="0"
                className="text-center text-lg" onChange={(e) => setAway(e.target.value)} />
            </div>
          </div>

          <div className="mt-4 space-y-3 border-t border-border pt-3">
            <Checkbox
              label="Mark match complete"
              hint={markComplete ? "Sets status = completed and marks the fixture done." : "Half-time mode: status = half_time; the fixture stays scheduled."}
              checked={markComplete}
              onChange={(e) => setMarkComplete(e.target.checked)}
            />
            {winnerRequired ? (
              <div className={cn("rounded-md border p-3", winner ? "border-border bg-bg-subtle" : "border-upset/50 bg-upset-bg/40")}>
                <Label htmlFor="winner">Advancing team (knockout, required)</Label>
                <Select id="winner" value={winner} onChange={(e) => setWinner(e.target.value)}>
                  <option value="">Who advanced?</option>
                  {teams.map((t) => <option key={t} value={t}>{t}</option>)}
                </Select>
                <p className="mt-1 text-xs text-muted">ET / penalties mean the score alone may not name the winner.</p>
              </div>
            ) : null}
          </div>
        </Card>

        {/* 3 - Half-time (§2.2 #22) */}
        <Card>
          <CardHeader title="Half-time score" hint="optional · §2.2 #22" />
          <Checkbox label="Record a half-time score" checked={htOn} onChange={(e) => setHtOn(e.target.checked)} />
          {htOn ? (
            <div className="mt-3 flex items-end justify-center gap-3">
              <div className="w-24">
                <Label htmlFor="ht-home">{match?.team_a ?? "Home"}</Label>
                <NumberInput id="ht-home" min={0} max={30} value={htHome} placeholder="0"
                  className="text-center" onChange={(e) => setHtHome(e.target.value)} />
              </div>
              <span className="pb-2 text-lg text-muted">–</span>
              <div className="w-24">
                <Label htmlFor="ht-away">{match?.team_b ?? "Away"}</Label>
                <NumberInput id="ht-away" min={0} max={30} value={htAway} placeholder="0"
                  className="text-center" onChange={(e) => setHtAway(e.target.value)} />
              </div>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted">Writes <code>ht_home_score</code> / <code>ht_away_score</code> on the match.</p>
          )}
        </Card>

        {/* 4 - Match-level flags */}
        <Card>
          <CardHeader title="Match flags" />
          <div className="grid gap-3 sm:grid-cols-2">
            <Checkbox label="Went to extra time" checked={extraTime} onChange={(e) => setExtraTime(e.target.checked)} />
            <Checkbox label="Decided on penalties" checked={penalties} onChange={(e) => setPenalties(e.target.checked)} />
          </div>
        </Card>

        {/* 5 - Events (§8) */}
        <Card>
          <CardHeader title="Events" hint="§8 · cards, injuries, subs, notes" />
          {match ? (
            <EventsEditor events={events} onChange={setEvents} teams={teams} />
          ) : (
            <p className="text-xs text-muted">Select a match first to log team-scoped events.</p>
          )}
        </Card>

        <div className="flex items-center gap-4">
          <button type="submit" disabled={busy || !matchId} className={btn}>
            {busy ? "Saving…" : markComplete ? "Save result + events" : "Save half-time + events"}
          </button>
          {error ? <p className="text-sm text-down">{error}</p> : null}
        </div>
      </form>

      {result ? (
        <Card className="mt-5 border-up/40">
          <div className="flex items-center gap-2">
            <Tag variant="up">Saved</Tag>
            <span className="text-sm font-medium text-fg">
              {result.match_id} · status {result.status} · {result.events_written} event{result.events_written === 1 ? "" : "s"} written
            </span>
            {result.simulated ? <Tag variant="upset">simulated (preview)</Tag> : null}
          </div>
          <SaveStatus key={saveSeq} result={result} />
        </Card>
      ) : null}
    </div>
  );
}
