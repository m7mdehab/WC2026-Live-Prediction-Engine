"use client";

import { Label, NumberInput, Select, TextArea, TextInput } from "@/components/admin/fields";
import type { EventInput, EventType, InjurySeverity } from "@/lib/types/events";

/** Per-incident event types the editor handles (match-level booleans - extra time / penalty
 *  shootout - live as quick toggles in the form, not here). */
const EDITOR_TYPES: { type: EventType; label: string }[] = [
  { type: "red_card", label: "Red card" },
  { type: "yellow_suspension", label: "Yellow → suspension" },
  { type: "injury", label: "Injury" },
  { type: "key_sub", label: "Key substitution" },
  { type: "manual_note", label: "Manual note" },
];

const LABEL: Record<EventType, string> = {
  red_card: "Red card",
  yellow_suspension: "Yellow → suspension",
  injury: "Injury",
  extra_time: "Extra time",
  penalty_shootout: "Penalty shootout",
  key_sub: "Key substitution",
  manual_note: "Manual note",
  half_time: "Half-time",
};

export function blankEvent(type: EventType): EventInput {
  return {
    event_type: type,
    team: null,
    minute: null,
    player: null,
    severity: type === "injury" ? "minor" : null,
    flag: type === "yellow_suspension" ? true : null,
    note: null,
  };
}

interface Props {
  events: EventInput[];
  onChange: (events: EventInput[]) => void;
  teams: string[]; // the two teams in the selected match (for team-scoped events)
}

/** A repeatable editor for the §8 per-incident events. Each row shows only the fields relevant to
 *  its type; writes one events-table row apiece (run_id NULL at entry - recalc consumes them). */
export function EventsEditor({ events, onChange, teams }: Props) {
  function update(i: number, patch: Partial<EventInput>) {
    onChange(events.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function remove(i: number) {
    onChange(events.filter((_, idx) => idx !== i));
  }
  function add(type: EventType) {
    onChange([...events, blankEvent(type)]);
  }

  return (
    <div className="space-y-3">
      {events.length === 0 ? (
        <p className="text-xs text-muted">No events added. Use the buttons below to log any that apply.</p>
      ) : (
        events.map((e, i) => (
          <div key={i} className="rounded-md border border-border bg-bg-subtle p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold tracking-wide text-secondary uppercase">{LABEL[e.event_type]}</span>
              <button
                type="button"
                onClick={() => remove(i)}
                className="text-xs text-muted hover:text-down"
                aria-label={`Remove ${LABEL[e.event_type]}`}
              >
                Remove
              </button>
            </div>
            <EventRowFields event={e} teams={teams} onUpdate={(patch) => update(i, patch)} />
          </div>
        ))
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {EDITOR_TYPES.map((t) => (
          <button
            key={t.type}
            type="button"
            onClick={() => add(t.type)}
            className="rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-secondary transition hover:border-confident hover:text-confident"
          >
            + {t.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function TeamSelect({
  value, teams, onChange,
}: { value: string | null; teams: string[]; onChange: (v: string | null) => void }) {
  return (
    <div>
      <Label>Team</Label>
      <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || null)}>
        <option value="">Select…</option>
        {teams.map((t) => (
          <option key={t} value={t}>{t}</option>
        ))}
      </Select>
    </div>
  );
}

function EventRowFields({
  event, teams, onUpdate,
}: { event: EventInput; teams: string[]; onUpdate: (patch: Partial<EventInput>) => void }) {
  switch (event.event_type) {
    case "red_card":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <TeamSelect value={event.team} teams={teams} onChange={(team) => onUpdate({ team })} />
          <div>
            <Label>Minute</Label>
            <NumberInput min={0} max={130} value={event.minute ?? ""} placeholder="e.g. 67"
              onChange={(e) => onUpdate({ minute: e.target.value === "" ? null : Number(e.target.value) })} />
          </div>
          <div>
            <Label>Player (optional)</Label>
            <TextInput value={event.player ?? ""} placeholder="name"
              onChange={(e) => onUpdate({ player: e.target.value || null })} />
          </div>
        </div>
      );
    case "yellow_suspension":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <TeamSelect value={event.team} teams={teams} onChange={(team) => onUpdate({ team })} />
          <div>
            <Label>Player (optional)</Label>
            <TextInput value={event.player ?? ""} placeholder="name"
              onChange={(e) => onUpdate({ player: e.target.value || null })} />
          </div>
          <label className="flex items-center gap-2 sm:col-span-2">
            <input type="checkbox" className="h-4 w-4 accent-[var(--confident)]"
              checked={event.flag ?? true}
              onChange={(e) => onUpdate({ flag: e.target.checked })} />
            <span className="text-sm text-fg">Triggers a suspension for the next match</span>
          </label>
        </div>
      );
    case "injury":
      return (
        <div className="grid gap-3 sm:grid-cols-3">
          <TeamSelect value={event.team} teams={teams} onChange={(team) => onUpdate({ team })} />
          <div>
            <Label>Player (optional)</Label>
            <TextInput value={event.player ?? ""} placeholder="name"
              onChange={(e) => onUpdate({ player: e.target.value || null })} />
          </div>
          <div>
            <Label>Severity</Label>
            <Select value={event.severity ?? "minor"}
              onChange={(e) => onUpdate({ severity: e.target.value as InjurySeverity })}>
              <option value="minor">Minor</option>
              <option value="major">Major</option>
              <option value="out">Out (tournament)</option>
            </Select>
          </div>
        </div>
      );
    case "key_sub":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_2fr]">
          <TeamSelect value={event.team} teams={teams} onChange={(team) => onUpdate({ team })} />
          <div>
            <Label>Note</Label>
            <TextInput value={event.note ?? ""} placeholder="e.g. striker on at HT, changes shape"
              onChange={(e) => onUpdate({ note: e.target.value || null })} />
          </div>
        </div>
      );
    case "manual_note":
      return (
        <div>
          <Label>Note</Label>
          <TextArea value={event.note ?? ""} placeholder="Anything the model should reflect (free text)."
            onChange={(e) => onUpdate({ note: e.target.value || null })} />
        </div>
      );
    default:
      return null;
  }
}
