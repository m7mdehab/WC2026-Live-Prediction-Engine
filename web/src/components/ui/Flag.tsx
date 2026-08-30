import Link from "next/link";
import { flagCode } from "@/lib/flags";
import { teamSlug } from "@/lib/teamSlug";
import { TEAM_CODE } from "@/lib/teamCodes";
import { cn } from "@/lib/utils";

// flag-icons (.fi) is normally em-sized, so a flag's pixel box floats with the
// surrounding font-size and the gray no-flag placeholder rendered a slightly
// different size. That let columns drift. We instead pin every flag (and the
// placeholder) to an EXPLICIT pixel box at a fixed 4:3 ratio, keyed off the same
// size token callers already pass. Real flag and placeholder share the identical
// width/height, so an unresolved nation never shifts the column and every row
// flag lines up on the same left edge.
//
// The token -> height map mirrors the Tailwind font-size scale this app uses, so
// existing call sites keep their visual sizing while gaining a concrete box.
const SIZE_PX: Record<string, number> = {
  "text-[11px]": 11,
  "text-xs": 12,
  "text-sm": 14,
  "text-base": 16,
  "text-lg": 18,
  "text-xl": 20,
  "text-2xl": 24,
  "text-3xl": 30,
  "text-4xl": 36,
  "text-[64px]": 64,
};

const DEFAULT_HEIGHT = 16; // matches text-base, the previous default

// Resolve a size token (or arbitrary "text-[NNpx]") to an explicit pixel height.
function heightFor(size: string): number {
  const known = SIZE_PX[size];
  if (known) return known;
  const bracket = /text-\[(\d+)px\]/.exec(size);
  if (bracket) return Number(bracket[1]);
  return DEFAULT_HEIGHT;
}

/** A nation is deep-linkable only when it is one of the 48 WC2026 teams (TEAM_CODE is the pure,
 *  client-safe 48-team map). This keeps flag deep-links off 404s: a non-WC player nation (or a
 *  blank/TBD slot) never gets wrapped in a link, since /teams/[id] rejects unknown slugs. */
function linkableTeam(team: string): boolean {
  return Object.prototype.hasOwnProperty.call(TEAM_CODE, team);
}

/**
 * Nation flag via flag-icons, rendered into a FIXED explicit box (width and
 * height in px, 4:3) so every flag occupies the identical space and aligns
 * vertically. The size prop still selects the box size; an unresolved nation
 * falls back to a placeholder of the SAME box, never a differently sized gap.
 *
 * LINKIFICATION (Wave 6): by DEFAULT every flag of a known WC2026 team is wrapped in a deep link
 * to that team's profile (/teams/[slug]), so a flag is a consistent site-wide affordance to the
 * team page. The wrapper is a single inline flex item, so gap/flex layouts and the flag box are
 * unchanged (the fixed box still lives on the inner flag span, so the flag-uniform guard holds).
 *
 * DISCOVERABILITY: the wrapper carries `flag-link` (globals.css) - cursor-pointer + a subtle
 * confident-accent hover/focus ring painted with box-shadow ONLY (zero-CLS), so users can SEE a
 * linked flag is clickable. Without it the deep link was invisible (a flag looked inert).
 *
 * NESTED-ANCHOR OPT-OUT: a nested <a> is invalid HTML and trips React hydration. Any call site that
 * already renders the flag INSIDE an anchor/Link/button (rows, tiles, bracket cells, chart legends,
 * the champion-flag-ring) MUST pass `link={false}` so the flag renders as the bare span it always
 * was. Reusable flag wrappers used in mixed contexts also pass it through as `false`.
 */
export function Flag({
  team,
  className,
  size = "text-base",
  link = true,
}: {
  team: string;
  className?: string;
  size?: string;
  /** Wrap the flag in a /teams/[slug] link (default). Set false wherever the flag is already
   *  inside an anchor/Link/button to avoid an invalid nested anchor + hydration mismatch. */
  link?: boolean;
}) {
  const code = flagCode(team);
  const h = heightFor(size);
  const w = Math.round((h * 4) / 3); // 4:3 box, the flag-icons aspect ratio
  // Identical box for real flag and placeholder. Explicit width/height defeats the
  // em-based .fi sizing; backgroundSize "cover" makes the real flag fill the box.
  const box = { width: `${w}px`, height: `${h}px` } as const;

  const flag = !code ? (
    <span
      className={cn("inline-block shrink-0 rounded-[2px] bg-elevated", className)}
      style={box}
      role="img"
      aria-label={`${team} (no flag)`}
    />
  ) : (
    <span
      className={cn(
        "fi inline-block shrink-0 rounded-[2px] shadow-[0_0_0_1px_rgb(0_0_0/0.06)]",
        `fi-${code}`,
        className,
      )}
      style={{ ...box, backgroundSize: "cover" }}
      role="img"
      aria-label={`${team} flag`}
    />
  );

  if (!link || !team || !linkableTeam(team)) return flag;

  // Single inline flex item wrapping the flag span: preserves surrounding gap/flex layout and the
  // flag's own fixed box, while making the flag a deep link to the team profile.
  return (
    <Link
      href={`/teams/${teamSlug(team)}`}
      aria-label={`${team} team profile`}
      className="flag-link inline-flex shrink-0 leading-none"
    >
      {flag}
    </Link>
  );
}
