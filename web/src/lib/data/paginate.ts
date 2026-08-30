import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// PostgREST silently caps an unfiltered/unranged select at a server-side maximum (1000 rows by
// default). A full-table read of a GROWTH-PRONE table (player_match_stats, players,
// player_projections, bracket_submissions) therefore goes SILENTLY WRONG the moment the table passes
// that cap: rows beyond row 1000 become invisible, so any board that AGGREGATES the whole table (sums
// goals across all of a player's match rows, builds the player universe, scores the human crowd) reads
// a truncated total. The fix is to page: ask for a fixed window at a time and keep going until the
// server returns a SHORT page (fewer rows than the window), which is the unambiguous signal that the
// last row has been read. This stays correct as the table grows past 1000 / 2000 / 10000 because the
// loop is bounded only by the real row count.

// The page window. Matches PostgREST's default max-rows so each round-trip pulls a full server page (a
// smaller window would just mean more round-trips; a larger one is clamped by the server anyway).
const PAGE_SIZE = 1000;

// Transient-error retry budget for a single page (see the loop below). Small + bounded so a genuinely
// persistent error still fails soft quickly, while a build-burst throttle is ridden out.
const MAX_PAGE_RETRIES = 3;
const PAGE_RETRY_BASE_MS = 150;

// The minimal chainable surface the helper needs: a query that can take a filter/order via `build`
// (each returns the same shape, so chains compose) AND can be paged with .range() into an awaitable
// result. supabase-js's PostgrestFilterBuilder satisfies this structurally; we keep our own narrow
// interface so the helper does not depend on supabase's heavily-generic builder types.
export interface ChainableQuery<Row> extends PromiseLike<{ data: Row[] | null; error: unknown }> {
  range(from: number, to: number): ChainableQuery<Row>;
  order(column: string, opts?: { ascending?: boolean; nullsFirst?: boolean }): ChainableQuery<Row>;
  eq(column: string, value: unknown): ChainableQuery<Row>;
  in(column: string, values: readonly unknown[]): ChainableQuery<Row>;
  gt(column: string, value: unknown): ChainableQuery<Row>;
  gte(column: string, value: unknown): ChainableQuery<Row>;
  lt(column: string, value: unknown): ChainableQuery<Row>;
  lte(column: string, value: unknown): ChainableQuery<Row>;
  neq(column: string, value: unknown): ChainableQuery<Row>;
}

/**
 * Read EVERY row of `table` (optionally filtered/ordered via `build`), defeating PostgREST's silent
 * 1000-row cap by paging with .range() until a short page returns. Fail-soft: on ANY page error it
 * logs and returns whatever it has accumulated so far (the [] shape the existing full-table reads
 * already degrade to), so a transient read error can never throw out of a fail-soft caller.
 *
 * @param sb       a supabase client (publicClient() or the service client).
 * @param table    the table name.
 * @param columns  the exact select column list (preserved verbatim from the caller).
 * @param build    optional chain extender: (q) => q.eq(...).order(...) applied to the SELECTED query
 *                 before .range() is attached on each page. Use it to add row filters / ordering. It
 *                 MUST return a still-chainable query. Leave it off for a plain full-table read.
 * @returns        all matching rows (typed as Row[]); [] on the first page erroring.
 */
export async function selectAll<Row = Record<string, unknown>>(
  sb: SupabaseClient,
  table: string,
  columns: string,
  build?: (q: ChainableQuery<Row>) => ChainableQuery<Row>,
): Promise<Row[]> {
  const out: Row[] = [];
  const client = sb as unknown as {
    from(t: string): { select(c: string): ChainableQuery<Row> };
  };
  for (let from = 0; ; from += PAGE_SIZE) {
    // Build a FRESH query per page: supabase-js's filter builder is single-use (awaiting it executes
    // it), so each page needs its own .from().select() with the caller's filters re-applied before
    // .range(). scaling-guard-ok: selectAll is the pagination helper itself (it IS the .range loop the
    // guard wants every growth-prone read to route through), so its .from/.select is sanctioned.
    //
    // RETRY a page on a TRANSIENT error before giving up: a static-generation build fires many workers'
    // reads at once, and a burst can draw a transient connection/throttle error (a 400 from the pooler)
    // that a plain fail-soft would turn into a CACHED-EMPTY result baked into that page. A short
    // exponential backoff clears the burst; only after exhausting retries do we fall soft to `out`.
    let data: Row[] | null = null;
    let error: unknown = null;
    for (let attempt = 0; ; attempt++) {
      const selected = client.from(table).select(columns);
      const query = build ? build(selected) : selected;
      ({ data, error } = await query.range(from, from + PAGE_SIZE - 1));
      if (!error || attempt >= MAX_PAGE_RETRIES) break;
      await new Promise((resolve) => setTimeout(resolve, PAGE_RETRY_BASE_MS * (attempt + 1)));
    }
    if (error) {
      console.error(`selectAll("${table}") page from ${from} failed after ${MAX_PAGE_RETRIES} retries:`, error);
      return out;
    }
    const page = (data ?? []) as Row[];
    out.push(...page);
    // A short page (fewer than the window) means the server returned the tail: we have every row.
    if (page.length < PAGE_SIZE) break;
  }
  return out;
}
