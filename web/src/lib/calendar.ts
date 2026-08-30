// Pure, dependency-free helpers for the two-month interactive matchday calendar (MatchCalendar).
// No "server-only", no DB, no React: month-grid construction, day bucketing, group/knockout tagging,
// and the capped-flags rule, all unit-testable in plain node. Deterministic (UTC); never calls an
// argless Date.now()/new Date() in a way that would break SSR -- every date comes from the data.
import type { Stage } from "@/lib/types";
import type { DailyFixture, DailyDateSummary } from "@/lib/data/daily";
import { stageLabel } from "@/lib/stage";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Weekday header labels, Monday-first (matches the site's en-GB date formatting). */
export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** One cell of a month grid: a real day (date + day-of-month) or a blank pad cell (both null). */
export interface CalendarDay {
  date: string | null; // YYYY-MM-DD (UTC) for a real day; null for a leading/trailing pad cell
  day: number | null;  // day-of-month for a real day; null for a pad cell
}

export interface CalendarMonth {
  key: string;             // "2026-06"
  label: string;           // "June 2026"
  weeks: CalendarDay[][];  // rows of exactly 7 cells (Monday-first)
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}
function ymd(y: number, m0: number, d: number): string {
  return `${y}-${pad2(m0 + 1)}-${pad2(d)}`;
}
function daysInMonth(y: number, m0: number): number {
  return new Date(Date.UTC(y, m0 + 1, 0)).getUTCDate();
}
/** Monday-first weekday index (0=Mon .. 6=Sun) for a UTC date. */
function mondayIndex(y: number, m0: number, d: number): number {
  return (new Date(Date.UTC(y, m0, d)).getUTCDay() + 6) % 7;
}

/** Build the month grids spanning [start, end] inclusive (both YYYY-MM-DD). DATA-DRIVEN: the months
 *  come from the fixture date range, never hardcoded. Each month is padded to whole Monday-first
 *  weeks. */
export function buildCalendarMonths(start: string, end: string): CalendarMonth[] {
  const [sy, sm] = start.split("-").map(Number); // sm is 1-based
  const [ey, em] = end.split("-").map(Number);
  if (!sy || !sm || !ey || !em) return [];
  const months: CalendarMonth[] = [];
  let y = sy;
  let m0 = sm - 1;
  // iterate month by month until we pass the end month (guard the loop to a sane max)
  for (let guard = 0; guard < 240 && (y < ey || (y === ey && m0 <= em - 1)); guard++) {
    const dim = daysInMonth(y, m0);
    const cells: CalendarDay[] = [];
    for (let i = 0; i < mondayIndex(y, m0, 1); i++) cells.push({ date: null, day: null });
    for (let d = 1; d <= dim; d++) cells.push({ date: ymd(y, m0, d), day: d });
    while (cells.length % 7 !== 0) cells.push({ date: null, day: null });
    const weeks: CalendarDay[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    months.push({ key: `${y}-${pad2(m0 + 1)}`, label: `${MONTH_NAMES[m0]} ${y}`, weeks });
    m0 += 1;
    if (m0 > 11) { m0 = 0; y += 1; }
  }
  return months;
}

/** Group vs knockout for a day, from its distinct stages: any non-group stage makes the day a
 *  KNOCKOUT day (knockout is the marquee tint); only-group is GROUP; no stages is null (rest day). */
export function dayStageKind(stages: Stage[] | undefined | null): "knockout" | "group" | null {
  if (!stages || stages.length === 0) return null;
  return stages.some((s) => s !== "group") ? "knockout" : "group";
}

/** The distinct resolved team names playing on a day (order preserved, deduped, slots/null dropped). */
export function dayTeams(fixtures: DailyFixture[]): string[] {
  const out: string[] = [];
  for (const f of fixtures) {
    for (const t of [f.team_a, f.team_b]) {
      if (t && !out.includes(t)) out.push(t);
    }
  }
  return out;
}

/** Cap a day's flags so a busy group day never overflows: show up to `cap`, then a "+N" remainder. */
export function cappedFlags(teams: string[], cap = 4): { shown: string[]; extra: number } {
  if (teams.length <= cap) return { shown: teams.slice(), extra: 0 };
  return { shown: teams.slice(0, cap), extra: teams.length - cap };
}

/** Bucket fixtures by their UTC calendar date (YYYY-MM-DD). Fixtures with no kickoff are dropped. */
export function bucketByDate(fixtures: DailyFixture[]): Record<string, DailyFixture[]> {
  const out: Record<string, DailyFixture[]> = {};
  for (const f of fixtures) {
    const d = f.kickoff_utc ? f.kickoff_utc.slice(0, 10) : null;
    if (!d) continue;
    (out[d] ||= []).push(f);
  }
  return out;
}

/** index.dates as a date-keyed lookup (matchCount / completedCount / stages per day). */
export function summaryByDate(dates: DailyDateSummary[]): Record<string, DailyDateSummary> {
  const out: Record<string, DailyDateSummary> = {};
  for (const d of dates) out[d.date] = d;
  return out;
}

/** A long, human UTC date label, e.g. "Sunday, 28 June" (client-safe; daily.formatDateLabel is
 *  server-only, so the interactive calendar reimplements it here). Deterministic (UTC). */
export function formatDayLabel(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long", day: "numeric", month: "long", timeZone: "UTC",
  }).format(d);
}

// ---- Per-round colour system ---------------------------------------------------------------------
// Each match day is tinted by its dominant round, on every viewport. A legend under the calendar maps
// each present round to its colour. The seven colours are a cool -> warm progression toward the gold
// Final; the up/down (win/loss) hues are deliberately excluded so scoreline meaning never collides.

/** Canonical stage order (cool -> warm toward the Final). The single source for the legend order and
 *  the dominant-round tie-break; mirrors the Stage union in @/lib/types. */
export const STAGE_ORDER: Stage[] = [
  "group", "round_of_32", "round_of_16", "quarter_finals",
  "semi_finals", "third_place_playoff", "final",
];

/** The Tailwind token classes for one round. The class strings are LITERAL so Tailwind's scanner
 *  emits them; components never build a colour class by interpolation. `label` comes from stageLabel
 *  so legend names never drift from the stage headers in MatchSections. */
export interface StageColor {
  token: string;       // design-token family name (also the data-stage value uses the Stage key)
  label: string;       // display name (from stageLabel)
  dot: string;         // legend dot + the per-cell colour bar fill
  tint: string;        // cell border + background tint (upcoming / live day)
  tintPlayed: string;  // reduced tint for a completed day (round colour kept, fainter)
  text: string;        // date + match-count text, in the round colour
}

/** Single typed Stage -> token map covering ALL seven stages. The four new tokens (slate / teal /
 *  violet / rose) and the three reused ones (confident / upset / gold) are referenced ONLY here; no
 *  component carries a per-cell colour literal. */
export const STAGE_COLOR: Record<Stage, StageColor> = {
  group:               { token: "slate",     label: stageLabel("group"),               dot: "bg-slate",     tint: "border-slate/40 bg-slate/10",         tintPlayed: "border-slate/25 bg-slate/5",         text: "text-slate" },
  round_of_32:         { token: "confident", label: stageLabel("round_of_32"),         dot: "bg-confident", tint: "border-confident/40 bg-confident/10", tintPlayed: "border-confident/25 bg-confident/5", text: "text-confident" },
  round_of_16:         { token: "teal",      label: stageLabel("round_of_16"),         dot: "bg-teal",      tint: "border-teal/40 bg-teal/10",           tintPlayed: "border-teal/25 bg-teal/5",           text: "text-teal" },
  quarter_finals:      { token: "violet",    label: stageLabel("quarter_finals"),      dot: "bg-violet",    tint: "border-violet/40 bg-violet/10",       tintPlayed: "border-violet/25 bg-violet/5",       text: "text-violet" },
  semi_finals:         { token: "rose",      label: stageLabel("semi_finals"),         dot: "bg-rose",      tint: "border-rose/40 bg-rose/10",           tintPlayed: "border-rose/25 bg-rose/5",           text: "text-rose" },
  third_place_playoff: { token: "upset",     label: stageLabel("third_place_playoff"), dot: "bg-upset",     tint: "border-upset/40 bg-upset/10",         tintPlayed: "border-upset/25 bg-upset/5",         text: "text-upset" },
  final:               { token: "gold",      label: stageLabel("final"),               dot: "bg-gold",      tint: "border-gold/40 bg-gold/10",           tintPlayed: "border-gold/25 bg-gold/5",           text: "text-gold" },
};

/** The dominant round to colour a day by: the stage with the most fixtures that day, ties broken
 *  toward the more advanced round (later in STAGE_ORDER). Pass the day's raw per-fixture stage list. */
export function dominantStage(stages: Stage[]): Stage | null {
  if (!stages.length) return null;
  const counts = new Map<Stage, number>();
  for (const s of stages) counts.set(s, (counts.get(s) ?? 0) + 1);
  let best: Stage | null = null;
  let bestCount = -1;
  let bestIdx = -1;
  for (const [s, c] of counts) {
    const idx = STAGE_ORDER.indexOf(s);
    if (c > bestCount || (c === bestCount && idx > bestIdx)) {
      best = s;
      bestCount = c;
      bestIdx = idx;
    }
  }
  return best;
}

/** The rounds that actually occur in the window, in tournament order (drives the legend). */
export function presentStagesInOrder(dates: DailyDateSummary[]): Stage[] {
  const present = new Set<Stage>();
  for (const d of dates) for (const s of d.stages) present.add(s);
  return STAGE_ORDER.filter((s) => present.has(s));
}

const SHORT_MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** Short month label for the mobile month switcher, e.g. "2026-06" -> "Jun". */
export function shortMonthLabel(key: string): string {
  const m = Number(key.split("-")[1]);
  return m >= 1 && m <= 12 ? SHORT_MONTH_NAMES[m - 1] : key;
}
