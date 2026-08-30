import { cn } from "@/lib/utils";

// Rail heights in px, FIXED so every page reserves the strip's space up front (zero layout
// shift while tile data resolves). STRIP_HEIGHT_CLASS carries the literal Tailwind utilities
// because the scanner needs literals; never rebuild the class by interpolating the numbers.
export const STRIP_HEIGHT_BASE = 84;
export const STRIP_HEIGHT_MD = 96;
export const STRIP_HEIGHT_CLASS = "h-[84px] md:h-[96px]";

/** The shared dashboard rail: a fixed-height region that lays its tiles out as a snap-scrolling
 *  row below md (self-contained overflow, so the rail can NEVER widen the document) and a plain
 *  distributed flex row from md up. Purely presentational and server-safe; tiles own their own
 *  fail-soft behaviour, the rail only owns geometry. */
export function LiveStrip({
  children,
  ariaLabel,
  className,
  marker,
}: {
  children: React.ReactNode;
  ariaLabel: string;
  className?: string;
  /** Stable test hook: rendered as data-dash-strip on the root section (omitted when undefined). */
  marker?: string;
}) {
  return (
    <section
      role="region"
      aria-label={ariaLabel}
      data-dash-strip={marker}
      className={cn("relative max-w-full", STRIP_HEIGHT_CLASS, className)}
    >
      {/* The rail itself is the scroll container; direct children become snap items below md and
          equal-width flex items from md up (md:*:flex-1 overrides the tiles' own base widths). */}
      <div
        className={cn(
          "flex h-full gap-2 md:gap-3",
          "snap-x snap-mandatory overflow-x-auto *:shrink-0 *:snap-start",
          "md:snap-none md:overflow-x-visible md:*:min-w-0 md:*:flex-1",
        )}
      >
        {children}
      </div>
      {/* Edge fades hint at off-screen tiles below md; token-driven (--bg) so they track the theme. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 w-5 bg-gradient-to-r from-bg to-transparent md:hidden"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-5 bg-gradient-to-l from-bg to-transparent md:hidden"
      />
    </section>
  );
}
