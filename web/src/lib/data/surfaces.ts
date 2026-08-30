// Phase 1.4 -- the canonical list of public surfaces that render results / the model run, plus a
// pure applier. NO next/cache import here so it is unit-testable; the route passes in revalidatePath.
//
// WHY this exists: force-dynamic routes are made fresh instantly by the data-version cache key
// (lib/data/version.ts) on ANY write -- including an AUTO write. The surfaces that DON'T get that for
// free are the ISR ones: /teams and /teams/[id] (export const revalidate = 300). On the AUTO path
// (GitHub Actions, no admin request) nothing busts them, so they could lag up to 5 min after an
// auto-written result -- "DB current, page stale". This list (busting /teams via the "layout"
// segment so /teams/[id] is included too) closes that, without a heavyweight full redeploy. The
// force-dynamic entries are belt-and-braces (cheap, harmless). Mirrors the admin route's list.

export type Surface = { path: string; type?: "page" | "layout" };

export const RESULT_SURFACES: Surface[] = [
  { path: "/teams", type: "layout" }, // ISR(300) -> the real target; "layout" also covers /teams/[id]
  { path: "/" },
  { path: "/matches" },
  { path: "/matches/day/[date]", type: "page" },
  { path: "/match/[matchId]", type: "page" },
  { path: "/groups" },
  { path: "/forecast" },
  { path: "/predict" },
  { path: "/players" },
  { path: "/players/[id]", type: "page" },
  { path: "/methodology" },
];

/** Apply revalidation for every result surface using the injected revalidatePath. Returns the list
 *  of what was revalidated (for the route's response / a test assertion). Pure but for the callback. */
export function applyRevalidation(
  rp: (path: string, type?: "page" | "layout") => void
): string[] {
  const done: string[] = [];
  for (const s of RESULT_SURFACES) {
    rp(s.path, s.type);
    done.push(s.type ? `${s.path}#${s.type}` : s.path);
  }
  return done;
}
