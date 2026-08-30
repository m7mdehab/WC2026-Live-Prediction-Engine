// projection-generation selection helpers (players track). Pure, DB-free, unit-testable from Node.
//
// READ GUARD: the loader inserts the FULL new generation (every player_projections row, stamped with
// one computed_at) BEFORE deleting the old one, so during a reproject two complete generations briefly
// coexist. We must NOT filter on a strict current_run id -- that blanks the boards during the
// reproject window (rows exist only under the OLD run while current_run already points at the NEW run
// that has no rows yet). Instead we select the LATEST COMPLETE GENERATION by computed_at: keep only the
// rows carrying the maximum computed_at present. This never returns empty while any complete generation
// exists, and when two coexist the newer one is the complete one.
//
// NOTE: web/scripts/test_projection_selection.mjs mirrors this exact algorithm (there is no TS test
// runner). Keep the two in sync.

/** A projection row carrying the freshness fields this module keys off. */
export interface GenerationRow {
  computed_at?: string | null;
  source_run_id?: string | null;
}

/** Keep ONLY the rows whose computed_at equals the maximum computed_at present (the latest complete
 *  generation). Rows missing computed_at are treated as the oldest (kept only if NOTHING has one).
 *  Returns the input as-is when no row carries a computed_at (pre-migration fallback). */
export function selectLatestGeneration<T extends GenerationRow>(rows: T[]): T[] {
  if (!rows || rows.length === 0) return [];
  let maxTs: string | null = null;
  for (const r of rows) {
    const ts = r.computed_at ?? null;
    if (ts != null && (maxTs === null || ts > maxTs)) maxTs = ts;
  }
  if (maxTs === null) return rows; // no freshness stamps at all -> nothing to filter on
  return rows.filter((r) => (r.computed_at ?? null) === maxTs);
}

/** The data contract derived from the SELECTED generation. */
export interface ProjectionMeta {
  /** The model run the generation was computed against (source_run_id). */
  runId: string | null;
  /** "condN" parsed from the run_id, or null for a base run with no cond token. */
  condLabel: string | null;
  /** As-of timestamp: parsed from the run_id ("live__YYYYMMDDTHHMMSSZ__..." -> ISO 8601), falling
   *  back to the generation's computed_at when the run_id has no parseable stamp. */
  asOfDate: string | null;
}

/** Parse "live__YYYYMMDDTHHMMSSZ__condN__seedS" defensively. Returns the ISO-8601 as-of (or null) and
 *  the cond label (or null). A base/offline run with no tokens does not break -> (null, null). */
function parseRunId(runId: string | null): { asOf: string | null; condLabel: string | null } {
  if (!runId) return { asOf: null, condLabel: null };
  let asOf: string | null = null;
  let condLabel: string | null = null;
  for (const tok of String(runId).split("__")) {
    // timestamp token: 8 digits + T + 6 digits + Z (e.g. 20260616T134501Z)
    if (/^\d{8}T\d{6}Z$/.test(tok)) {
      const y = tok.slice(0, 4), mo = tok.slice(4, 6), d = tok.slice(6, 8);
      const h = tok.slice(9, 11), mi = tok.slice(11, 13), s = tok.slice(13, 15);
      asOf = `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
    } else if (/^cond\d+$/.test(tok)) {
      condLabel = tok;
    }
  }
  return { asOf, condLabel };
}

/** Derive the {runId, condLabel, asOfDate} contract from a set of projection rows: pick the latest
 *  generation, take its source_run_id, parse cond/as-of from the run_id, fall back to computed_at for
 *  as-of when the run_id has no parseable stamp. Returns null when there are no rows. */
export function projectionMetaFromRows<T extends GenerationRow>(rows: T[]): ProjectionMeta | null {
  const gen = selectLatestGeneration(rows);
  if (gen.length === 0) return null;
  const runId = gen[0].source_run_id ?? null;
  const { asOf, condLabel } = parseRunId(runId);
  const computedAt = gen[0].computed_at ?? null;
  return { runId, condLabel, asOfDate: asOf ?? computedAt };
}
