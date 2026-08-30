"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { cn } from "@/lib/utils";
import { COLUMN_LABEL, roleTagVariant } from "@/lib/players";
import type { PlayerIndexRow } from "@/lib/types/players";

const ROLES = ["GK", "DF", "MF", "FW"] as const;
type RoleFilter = "ALL" | (typeof ROLES)[number];
type RoleTab = RoleFilter;

// A column id maps 1:1 to a PlayerIndexRow field; the table reads its value through the column accessor.
type ColumnId =
  | "actualGoals" | "actualAssists" | "expectedGoals" | "expectedAssists"
  | "actualCleanSheets" | "actualGoalsConceded" | "actualSaves"
  | "expectedGoalsPrevented" | "expectedCleanSheets";

// Pagination: the first render shows the top FIRST_PAGE rows; the first "show more" expands to NEXT_STEP,
// and each subsequent click adds another NEXT_STEP (10 -> 50 -> 100 -> 150 -> ...).
const FIRST_PAGE = 10;
const NEXT_STEP = 50;

// The default (non-column) sort: ACTUALS-first, generalized per tab (the tab's actual columns in order,
// each descending, name as the final tiebreak). The contributions sort (goal-contributions desc) is the
// old default, retained as a selectable option. Both are tab-independent (never clamped on tab switch).
const DEFAULT_SORT = "default";
const CONTRIB_SORT = "contributions";
type SortKey = typeof DEFAULT_SORT | typeof CONTRIB_SORT | ColumnId;

// A global (tab-independent) sort is one of the two non-column keys; it is never clamped on a tab switch
// and never resolves to a Column.
const isGlobalSort = (s: SortKey) => s === DEFAULT_SORT || s === CONTRIB_SORT;

// The canonical null-value placeholder glyph (the only allowed standalone em-dash use): a projected
// value that is null shows this, never a fabricated 0.
const NULL_GLYPH = "—";

/** A column descriptor: how the table reads, formats and sorts one numeric column. `kind` "actual" is an
 *  integer count (rendered directly), "expected" is a projection rendered to one decimal (or the
 *  placeholder glyph when null). The accessor returns the row's value (null only for expected columns). */
interface Column {
  id: ColumnId;
  abbr: string;
  legend: string;
  kind: "actual" | "expected";
  get: (r: PlayerIndexRow) => number | null;
}

function col(id: ColumnId, kind: "actual" | "expected", get: (r: PlayerIndexRow) => number | null): Column {
  return { id, kind, get, abbr: COLUMN_LABEL[id].abbr, legend: COLUMN_LABEL[id].legend };
}

// Every column the index can render, keyed by id (one source of truth for the per-tab column sets,
// the legend line, the sort options and the cell formatter).
const COLUMNS: Record<ColumnId, Column> = {
  actualGoals: col("actualGoals", "actual", (r) => r.actualGoals),
  actualAssists: col("actualAssists", "actual", (r) => r.actualAssists),
  expectedGoals: col("expectedGoals", "expected", (r) => r.expectedGoals),
  expectedAssists: col("expectedAssists", "expected", (r) => r.expectedAssists),
  actualCleanSheets: col("actualCleanSheets", "actual", (r) => r.actualCleanSheets),
  actualGoalsConceded: col("actualGoalsConceded", "actual", (r) => r.actualGoalsConceded),
  actualSaves: col("actualSaves", "actual", (r) => r.actualSaves),
  expectedGoalsPrevented: col("expectedGoalsPrevented", "expected", (r) => r.expectedGoalsPrevented),
  expectedCleanSheets: col("expectedCleanSheets", "expected", (r) => r.expectedCleanSheets),
};

// The ordered column set per tab. All/FW/MF lead with the attacking AG|AA|XG|XA set (unchanged). GK
// leads with clean sheets + goals conceded + saves + the keeper shot-stopping projection (GP). DF leads
// with clean sheets + the defenders' real goals/assists + their expected goals + the defensive-value
// projection (xCS). The empty-column rule (columnHasData) drops any of these uniformly empty for the
// rendered rows: in the current data defenders carry no clean sheets and no expected_clean_sheets, so
// CS and xCS fall away and DF resolves to AG|AA|XG; CS/xCS stay declared so they reappear automatically
// if the data ever attributes them.
const TAB_COLUMNS: Record<RoleTab, ColumnId[]> = {
  ALL: ["actualGoals", "actualAssists", "expectedGoals", "expectedAssists"],
  FW: ["actualGoals", "actualAssists", "expectedGoals", "expectedAssists"],
  MF: ["actualGoals", "actualAssists", "expectedGoals", "expectedAssists"],
  GK: ["actualCleanSheets", "actualGoalsConceded", "actualSaves", "expectedGoalsPrevented"],
  DF: ["actualCleanSheets", "actualGoals", "actualAssists", "expectedGoals", "expectedCleanSheets"],
};

/** Expected value to ONE decimal place, consistently (so 2 reads "2.0" and stacks under "4.3"), or the
 *  bare null-value placeholder when the projection is null (never a fabricated 0). Actual columns are
 *  integers and render directly, so this is only for the expected (projection) columns. */
function fmtExpected(v: number | null): string {
  return v == null ? NULL_GLYPH : v.toFixed(1);
}

/** Render one column's cell value for a row: an integer actual rendered directly, or a projection to one
 *  decimal (the placeholder glyph when null). */
function cellText(c: Column, r: PlayerIndexRow): string {
  if (c.kind === "actual") return String(c.get(r) ?? 0);
  return fmtExpected(c.get(r));
}

/** A column is RENDERABLE for the current rendered set only when at least one row carries a non-empty
 *  value for it: an actual > 0, or an expected that is non-null. A column uniformly zero/dash/empty
 *  across the rows is OMITTED (the hard per-role rule: never show a dead column for that role). */
function columnHasData(c: Column, rows: PlayerIndexRow[]): boolean {
  if (c.kind === "actual") return rows.some((r) => (c.get(r) ?? 0) !== 0);
  return rows.some((r) => c.get(r) != null);
}

/** Whether a row belongs in the ALL tab: every FW/MF, PLUS any GK/DF who has actually scored or assisted
 *  (so the ALL tab's AG|AA|XG|XA columns are always meaningful for the keepers/defenders present). All
 *  other GK/DF stay only in their own role tab. A row with no role at all is included (best-effort). */
function inAllTab(r: PlayerIndexRow): boolean {
  if (r.role === "GK" || r.role === "DF") return r.actualGoals > 0 || r.actualAssists > 0;
  return true;
}

function Pill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium motion-safe:transition-colors",
        active ? "bg-gold/10 text-gold" : "bg-elevated text-secondary hover:text-fg"
      )}
    >
      {children}
    </button>
  );
}

/** The /players index: a client island over the server-fetched list. A real semantic table whose numeric
 *  columns ADAPT per role tab (All/FW/MF lead with AG|AA|XG|XA; GK leads with CS|GC|Saves|GP; DF leads
 *  with CS|AG|AA|xCS) beside a flexing Player column. A column uniformly empty for the rendered rows is
 *  omitted (never a dead column). Filters by role + nation + a free-text name/nation search (all
 *  in-memory, the page stays a fast server read) and sorts by any visible numeric column high-to-low
 *  (the sort control lists ONLY options valid for the current tab) plus a goals-first DEFAULT (the tab's
 *  actual columns in order, each descending) and the retained contributions (G+A) sort as an option.
 *  Search + filters apply across the FULL set first; pagination (top 10, then +50 each click) then
 *  applies to the filtered result.
 *
 *  `initialRole` only seeds the default role chip (defaults to ALL) and `initialSort` only seeds the
 *  default sort option (defaults to the goals-first DEFAULT_SORT); the page never passes either, but they
 *  let the SSR DOM test render a specific role tab / sort without a client interaction. */
export function PlayersIndexView({
  rows,
  initialRole = "ALL",
  initialSort = DEFAULT_SORT,
}: {
  rows: PlayerIndexRow[];
  initialRole?: RoleFilter;
  initialSort?: SortKey;
}) {
  const [role, setRole] = useState<RoleFilter>(initialRole);
  const [nation, setNation] = useState<string>("ALL");
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [query, setQuery] = useState("");
  // How many rows are currently revealed. Starts at FIRST_PAGE; each "show more" grows it (to NEXT_STEP,
  // then +NEXT_STEP). Any filter/sort/search change resets it so the cap always reflects the CURRENT
  // post-filter list (the wrappers below reset it alongside each setter).
  const [limit, setLimit] = useState(FIRST_PAGE);
  // Switching tab resets pagination AND clamps the sort: if the active sort is a column the new tab no
  // longer shows, fall back to the goals-first default (so the control never holds an invalid option). A
  // global sort (default or contributions) is tab-independent and never clamped. Done in the event
  // handler (not an effect) so there is no cascading re-render.
  const pickRole = (r: RoleFilter) => {
    setRole(r);
    setLimit(FIRST_PAGE);
    if (!isGlobalSort(sort) && !TAB_COLUMNS[r].includes(sort)) setSort(DEFAULT_SORT);
  };
  const pickNation = (n: string) => { setNation(n); setLimit(FIRST_PAGE); };
  const pickQuery = (q: string) => { setQuery(q); setLimit(FIRST_PAGE); };

  const nations = useMemo(
    () => [...new Set(rows.map((r) => r.nation))].sort((a, b) => a.localeCompare(b)),
    [rows]
  );

  // The ordered column SET for the current tab (before the empty-column omission, which depends on the
  // filtered rows). Used to scope the sort options to the visible columns.
  const tabColumns = useMemo(() => TAB_COLUMNS[role].map((id) => COLUMNS[id]), [role]);

  // The ordered ACTUAL columns of the current tab: the goals-first DEFAULT sort iterates these in order,
  // each descending. Actual columns are never null; a column uniformly empty for a tab (e.g. DF clean
  // sheets) compares all-equal and is a natural no-op. So ALL/FW/MF lead with AG, GK leads with CS, and DF
  // resolves to AG -> AA. Computed from the declared per-tab set (independent of the filtered rows).
  const defaultSortCols = useMemo(() => tabColumns.filter((c) => c.kind === "actual"), [tabColumns]);

  // The sort key the table actually applies: the chosen sort when it is still a column of THIS tab,
  // otherwise the default. A global sort (default or contributions) is always honoured. A belt-and-braces
  // clamp on top of the role-picker reset, so a stale sort can never drive an invalid comparator (and the
  // initialRole SSR path is always consistent too).
  const effectiveSort: SortKey =
    isGlobalSort(sort) || TAB_COLUMNS[role].includes(sort) ? sort : DEFAULT_SORT;

  const filtered = useMemo(() => {
    // Search COMPLEMENTS the nation dropdown: a case-insensitive substring match on name OR nation,
    // applied alongside the role + nation filters in the same pipeline. The ALL tab uses the membership
    // rule (every FW/MF, plus only scoring/assisting GK/DF); a role tab keeps every player of that role.
    const q = query.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (role === "ALL" ? inAllTab(r) : r.role === role) &&
        (nation === "ALL" || r.nation === nation) &&
        (q === "" ||
          r.name.toLowerCase().includes(q) ||
          r.nation.toLowerCase().includes(q))
    );
    const sortCol = isGlobalSort(effectiveSort) ? null : COLUMNS[effectiveSort];
    out.sort((a, b) => {
      if (sortCol) {
        // Sort by the chosen visible column, high to low. An expected column's null sorts to the bottom;
        // an actual column's value is always a real integer. Ties fall through to the name.
        const av = sortCol.get(a);
        const bv = sortCol.get(b);
        if (av == null && bv == null) return a.name.localeCompare(b.name);
        if (av == null) return 1;
        if (bv == null) return -1;
        return bv - av || a.name.localeCompare(b.name);
      }
      if (effectiveSort === CONTRIB_SORT) {
        // Contributions (the old default, kept as an option): rank by goal contributions (actualGoals +
        // actualAssists) desc, then by the projected contribution desc, then name asc. Rows with no
        // actual AND no projection sort to the bottom.
        const aActual = a.actualGoals + a.actualAssists;
        const bActual = b.actualGoals + b.actualAssists;
        const aExp = (a.expectedGoals ?? 0) + (a.expectedAssists ?? 0);
        const bExp = (b.expectedGoals ?? 0) + (b.expectedAssists ?? 0);
        const aEmpty = aActual === 0 && a.expectedGoals == null && a.expectedAssists == null;
        const bEmpty = bActual === 0 && b.expectedGoals == null && b.expectedAssists == null;
        if (aEmpty !== bEmpty) return aEmpty ? 1 : -1;
        return bActual - aActual || bExp - aExp || a.name.localeCompare(b.name);
      }
      // Default (goals-first): the tab's actual columns in order, each descending; the first nonzero
      // difference wins, then name asc. Actual values are never null, so a uniformly-empty actual column
      // for the tab compares all-equal and is a natural no-op (e.g. DF resolves to AG -> AA, GK leads with
      // CS, ALL/FW/MF lead with AG). This ranks a 4-goal/0-assist player above a 3-goal/2-assist player.
      for (const c of defaultSortCols) {
        const d = (c.get(b) ?? 0) - (c.get(a) ?? 0);
        if (d !== 0) return d;
      }
      return a.name.localeCompare(b.name);
    });
    return out;
  }, [rows, role, nation, effectiveSort, defaultSortCols, query]);

  // PAGINATION: only the first `limit` rows render until "show more" grows the cap; the count reflects
  // the CURRENT filtered set. Search + filters already applied above, so pagination only ever caps the
  // already-filtered result (a search is never limited to a loaded page).
  const visible = filtered.slice(0, limit);
  const remaining = filtered.length - visible.length;
  // The next "show more" step: from the first page jump straight to NEXT_STEP, then add NEXT_STEP each
  // click. The button label shows the actual increment (capped at what is left).
  const nextLimit = limit < NEXT_STEP ? NEXT_STEP : limit + NEXT_STEP;
  const nextIncrement = Math.min(nextLimit, filtered.length) - visible.length;

  // The columns that actually RENDER: the tab's set minus any column uniformly empty across the WHOLE
  // filtered set (the hard per-role rule). Computed over `filtered` (not the visible slice) so the
  // column set stays stable as pagination reveals more rows, and so the sort options match the header.
  const columns = useMemo(
    () => tabColumns.filter((c) => columnHasData(c, filtered)),
    [tabColumns, filtered]
  );

  // The per-tab legend line: the ONLY copy on the card. It defines exactly the columns this tab shows,
  // middle-dot separated, on one line. Built from the rendered columns so it never names an omitted one.
  const legend = columns.map((c) => c.legend).join(" · ");

  // The Sort control's displayed value: the effective sort only when it is a currently-RENDERED column
  // (so the <select> value always matches an option); otherwise the default. The comparator still uses
  // effectiveSort, but an omitted (all-empty) column sorts every row equal, so the two never disagree.
  const selectValue: SortKey =
    isGlobalSort(effectiveSort) || columns.some((c) => c.id === effectiveSort)
      ? effectiveSort
      : DEFAULT_SORT;

  return (
    <Card>
      {/* filters + sort + search */}
      <div className="mb-4 flex flex-col gap-3 border-b border-border pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[10px] font-medium tracking-wide text-muted uppercase">Role</span>
          <Pill active={role === "ALL"} onClick={() => pickRole("ALL")}>All</Pill>
          {ROLES.map((r) => (
            <Pill key={r} active={role === r} onClick={() => pickRole(r)}>{r}</Pill>
          ))}
        </div>
        {/* Free-text search COMPLEMENTS the Nation dropdown: instant, client-side, name OR nation. */}
        <label className="flex min-w-0 flex-col gap-1 text-xs text-secondary">
          <span className="text-[10px] font-medium tracking-wide text-muted uppercase">Search</span>
          <input
            type="search"
            value={query}
            onChange={(e) => pickQuery(e.target.value)}
            placeholder="Search by name or nation"
            aria-label="Search players by name or nation"
            className="w-full min-w-0 rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs text-fg placeholder:text-muted"
          />
        </label>
        {/* Nation + Sort SIDE BY SIDE: two equal columns at phone width. Each select fills its half so
            neither overflows at 390px. */}
        <div className="grid grid-cols-2 gap-3">
          <label className="flex min-w-0 flex-col gap-1 text-xs text-secondary">
            <span className="text-[10px] font-medium tracking-wide text-muted uppercase">Nation</span>
            <select
              value={nation}
              onChange={(e) => pickNation(e.target.value)}
              className="w-full min-w-0 rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs text-fg"
            >
              <option value="ALL">All nations</option>
              {nations.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-xs text-secondary">
            <span className="text-[10px] font-medium tracking-wide text-muted uppercase">Sort</span>
            {/* The sort options ADAPT to the current tab: a goals-first DEFAULT (the tab's actual columns
                in order, each descending) and the contributions (G+A) sort, plus one high-to-low option
                per VISIBLE numeric column of this tab (so a GK tab never offers an XG sort, a DF tab never
                offers a GP sort, etc). */}
            <select
              value={selectValue}
              onChange={(e) => { setSort(e.target.value as SortKey); setLimit(FIRST_PAGE); }}
              className="w-full min-w-0 rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs text-fg"
            >
              <option value={DEFAULT_SORT}>Default (goals first)</option>
              <option value={CONTRIB_SORT}>Contributions (G+A)</option>
              {columns.map((c) => (
                <option key={c.id} value={c.id}>{c.abbr} (high to low)</option>
              ))}
            </select>
          </label>
        </div>
        <span className="tnum text-xs text-muted">{filtered.length} players</span>
      </div>

      {filtered.length === 0 || columns.length === 0 ? (
        <p className="py-6 text-center text-sm text-secondary">
          No tracked players match this filter. Try widening the role, nation, or search.
        </p>
      ) : (
        <>
        {/* A real semantic table: table-fixed with a flexing Player column (w-full, min-w-0 inner) and
            up to FOUR fixed-width numeric columns that ADAPT per role tab. The numeric columns RESERVE
            explicit widths (w-12) so a wrapping player name NEVER shifts them out of vertical alignment;
            each is right-aligned + tabular-nums (tnum) so digits and decimals stack. Faint
            semi-transparent row dividers (divide-border/60) over the surface, not a heavy fully-gridded
            table. A column uniformly empty for the rendered rows is omitted, never shown dead. */}
        <table className="w-full table-fixed border-collapse">
          <thead>
            <tr className="border-b border-border text-[10px] font-medium tracking-wide text-muted uppercase">
              <th className="w-full py-1 pl-1 text-left font-medium">Player</th>
              {columns.map((c, i) => (
                <th
                  key={c.id}
                  className={cn(
                    "tnum w-12 px-1 py-1 text-right font-medium",
                    i === columns.length - 1 && "pr-1"
                  )}
                >
                  {c.abbr}
                </th>
              ))}
            </tr>
            {/* The single one-line abbreviation KEY (the ONLY copy on the card). It ADAPTS per tab to
                define exactly that tab's visible columns. Middle-dot separators, never an em-dash. */}
            <tr>
              <td colSpan={columns.length + 1} className="border-b border-border/60 py-1 pl-1 text-[10px] text-muted">
                {legend}
              </td>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {visible.map((r) => (
              <tr key={r.id} className="hover:bg-elevated/60">
                <td className="w-full min-w-0 py-1.5 pl-1 align-top">
                  {/* FULL NAMES: the name span has NO truncate; a long name WRAPS (break-words /
                      whitespace-normal). items-start + shrink-0 flag/tag keep alignment on the first line. */}
                  <Link href={`/players/${r.id}`} className="flex min-w-0 items-start gap-2 hover:underline">
                    <Flag team={r.nation} size="text-base" className="mt-0.5 shrink-0" link={false} />
                    <span className="min-w-0 text-sm font-medium break-words whitespace-normal text-fg">{r.name}</span>
                    {r.role ? (
                      <Tag variant={roleTagVariant(r.role)} className="mt-0.5 shrink-0 px-1.5 py-0 text-[10px]">
                        {r.role}
                      </Tag>
                    ) : null}
                  </Link>
                </td>
                {columns.map((c, i) => (
                  <td
                    key={c.id}
                    className={cn(
                      "tnum w-12 px-1 py-1.5 text-right align-top text-sm",
                      c.kind === "actual" ? "text-fg" : "text-muted",
                      i === columns.length - 1 && "pr-1"
                    )}
                  >
                    {cellText(c, r)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {remaining > 0 ? (
          <div className="mt-3 flex justify-center">
            <button
              type="button"
              onClick={() => setLimit(nextLimit)}
              className="rounded-md bg-elevated px-3 py-1.5 text-xs font-medium text-secondary hover:text-fg motion-safe:transition-colors"
            >
              {`Show ${nextIncrement} more (${remaining} left)`}
            </button>
          </div>
        ) : null}
        </>
      )}
    </Card>
  );
}
