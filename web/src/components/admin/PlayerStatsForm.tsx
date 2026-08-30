"use client";

import { useMemo, useState } from "react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Label, NumberInput, Select } from "@/components/admin/fields";
import type {
  AdminEntryMatch,
  AdminPlayer,
  PlayerStatResult,
  PlayerStatSubmission,
} from "@/lib/types/events";

const btn =
  "inline-flex items-center justify-center rounded-md bg-confident px-5 py-2.5 text-sm " +
  "font-semibold text-white transition hover:bg-[var(--confident-hover)] disabled:opacity-50";

const STAGE_LABEL: Record<string, string> = {
  group: "Group", round_of_32: "R32", round_of_16: "R16",
  quarter_finals: "QF", semi_finals: "SF", third_place_playoff: "3rd place", final: "Final",
};

interface Props {
  players: AdminPlayer[];
  matches: AdminEntryMatch[];
  adminEmail: string;
  preview?: boolean;
}

/** The numeric fields, in display order, grouped for the two-column layout. */
const FIELDS: { key: keyof PlayerStatSubmission; label: string; step?: string }[] = [
  { key: "minutes", label: "Minutes" },
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "shots", label: "Shots" },
  { key: "xg", label: "xG", step: "0.01" },
  { key: "xa", label: "xA", step: "0.01" },
  { key: "passes", label: "Passes (accurate)" },
  { key: "pass_completion", label: "Pass completion %", step: "0.1" },
  { key: "key_passes", label: "Key passes" },
  { key: "progressive_passes", label: "Progressive passes" },
  { key: "duels_won", label: "Duels won" },
  { key: "saves", label: "Saves" },
  { key: "goals_conceded", label: "Goals conceded" },
  { key: "yellow", label: "Yellow cards" },
  { key: "red", label: "Red cards" },
];

type StatValues = Partial<Record<keyof PlayerStatSubmission, string>>;

/** Protected MANUAL player-stat override (Phase 4 - the always-correct system of record). Pick a
 *  player + match, enter the stat line, submit. The row is written source='manual', locked=true and
 *  is NEVER clobbered by the best-effort FotMob ingester. Mirrors the score-entry form's look. */
export function PlayerStatsForm({ players, matches, adminEmail, preview }: Props) {
  const [playerId, setPlayerId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [vals, setVals] = useState<StatValues>({});
  const [cleanSheet, setCleanSheet] = useState<"unset" | "yes" | "no">("unset");

  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PlayerStatResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const player = useMemo(() => players.find((p) => p.id === playerId) ?? null, [players, playerId]);

  function setField(key: keyof PlayerStatSubmission, v: string) {
    setVals((prev) => ({ ...prev, [key]: v }));
    setResult(null); setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setResult(null);
    if (!playerId) { setError("Select a player."); return; }
    if (!matchId) { setError("Select a match."); return; }

    const payload: Record<string, unknown> = { player_id: playerId, match_id: matchId };
    for (const f of FIELDS) {
      const raw = vals[f.key];
      payload[f.key] = raw == null || raw === "" ? null : Number(raw);
    }
    payload.clean_sheet = cleanSheet === "unset" ? null : cleanSheet === "yes";

    setBusy(true);
    try {
      const r = await fetch("/api/admin/player-stats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setError(data.error ?? `Request failed (${r.status}).`);
      } else {
        setResult(data as PlayerStatResult);
      }
    } catch {
      setError("Network error. The stat line was not saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="font-display text-xl font-bold text-fg">Player stats · manual override</h2>
        <Tag variant="confident">System of record</Tag>
        {preview ? <Tag variant="upset">Local preview</Tag> : null}
      </div>
      <p className="flex items-start gap-2 rounded-md border border-border bg-bg-subtle px-3 py-2 text-xs text-secondary">
        <span aria-hidden>★</span>
        <span>
          What you enter here is the <strong>authoritative</strong> per-match line
          (<code className="text-fg">source=manual</code>, <code className="text-fg">locked</code>):
          the best-effort FotMob auto-ingest never overwrites it. Leave a field blank to store NULL.
          Signed in as <span className="font-medium text-fg">{adminEmail}</span>.
        </span>
      </p>

      {/* 1 - Player + match */}
      <Card>
        <CardHeader title="Player &amp; match" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="player">Player</Label>
            <Select id="player" value={playerId} onChange={(e) => { setPlayerId(e.target.value); setResult(null); setError(null); }} required>
              <option value="">Select a player…</option>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.nation}{p.role ? ` · ${p.role}` : ""}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="pmatch">Match</Label>
            <Select id="pmatch" value={matchId} onChange={(e) => { setMatchId(e.target.value); setResult(null); setError(null); }} required>
              <option value="">Select a match…</option>
              {matches.map((m) => (
                <option key={m.match_id} value={m.match_id}>
                  {m.match_id} · {STAGE_LABEL[m.stage] ?? m.stage} · {m.team_a ?? "TBD"} v {m.team_b ?? "TBD"}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {player ? (
          <p className="mt-2 text-xs text-muted">
            <code className="text-fg">{player.id}</code> · {player.team ?? player.nation}
          </p>
        ) : null}
      </Card>

      {/* 2 - Stat line */}
      <Card>
        <CardHeader title="Stat line" hint="blank = NULL" />
        <div className="grid gap-3 sm:grid-cols-3">
          {FIELDS.map((f) => (
            <div key={f.key}>
              <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
              <NumberInput
                id={`f-${f.key}`}
                min={0}
                step={f.step ?? "1"}
                value={vals[f.key] ?? ""}
                placeholder="—"
                onChange={(e) => setField(f.key, e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <Label htmlFor="cs">Clean sheet</Label>
          <Select id="cs" value={cleanSheet} onChange={(e) => setCleanSheet(e.target.value as "unset" | "yes" | "no")}>
            <option value="unset">Not recorded</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </Select>
        </div>
      </Card>

      <div className="flex items-center gap-4">
        <button type="submit" disabled={busy || !playerId || !matchId} className={btn}>
          {busy ? "Saving…" : "Save manual stat line"}
        </button>
        {error ? <p className="text-sm text-down">{error}</p> : null}
      </div>

      {result ? (
        <Card className="mt-2 border-up/40">
          <div className="flex items-center gap-2">
            <Tag variant="up">Saved</Tag>
            <span className="text-sm font-medium text-fg">
              {result.player_id} · {result.match_id} · source {result.source} · locked
            </span>
            {result.simulated ? <Tag variant="upset">simulated (preview)</Tag> : null}
          </div>
          <p className="mt-2 text-xs text-secondary">
            This line is now authoritative and protected from the auto-ingester. Player surfaces revalidated.
          </p>
        </Card>
      ) : null}
    </form>
  );
}
