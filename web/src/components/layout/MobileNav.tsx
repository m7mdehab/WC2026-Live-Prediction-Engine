"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { TrendingUp, ListOrdered, Target, Users } from "lucide-react";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** Hand-drawn pitch glyph (lucide has no football-pitch icon). Matches lucide's visual language:
 *  24x24 viewBox, stroke-width 2, round caps/joins, currentColor, no fill - outline, halfway line,
 *  centre circle, and the two penalty boxes. Sized/coloured by the cell exactly like the lucide
 *  icons (inherits currentColor; width/height from the className). */
function PitchIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M12 5v14" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M3 9h3v6H3" />
      <path d="M21 9h-3v6h3" />
    </svg>
  );
}

// Locked icon per nav route. Forecast → rising line; Matches → pitch; Groups → ranked list;
// Predict → bullseye; Players → people (lucide Users reads as a squad). Keyed by href so it stays
// aligned with lib/nav.ts.
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "/forecast": TrendingUp,
  "/matches": PitchIcon,
  "/groups": ListOrdered,
  "/predict": Target,
  "/players": Users,
};

/** Active when the path equals the item's route OR is a sub-route of it (prefix match), so
 *  /matches/day/<date> highlights Matches and /forecast (hash ignored by usePathname) highlights
 *  Forecast. Home ("/") matches no entry, so nothing is highlighted there. */
function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** The tappable cell. useLinkStatus (valid only inside a <Link>) flips `pending` the instant the
 *  item is tapped, so it turns gold immediately - instant acknowledgement before the route resolves,
 *  on top of the persistent gold for the current route. */
function NavCell({
  Icon,
  label,
  active,
}: {
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
}) {
  const { pending } = useLinkStatus();
  const on = active || pending;
  return (
    <span
      className={cn(
        "flex min-h-[44px] w-full flex-col items-center justify-center gap-1 py-1.5 text-[11px] font-medium",
        on ? "bg-gold/10 text-gold" : "text-secondary",
        // gentle, credible motion: colour/tint eases in, a subtle press dip on tap;
        // gated behind motion-safe so reduced-motion shows the state with no animation.
        "motion-safe:transition-colors motion-safe:duration-200 motion-safe:active:scale-95"
      )}
    >
      <Icon className="h-[22px] w-[22px]" />
      {label}
    </span>
  );
}

/** Fixed bottom navigation - mobile only (the desktop shell uses the top nav). Icon over label,
 *  gold active state on the current route, gentle motion-safe transitions, iOS safe-area inset. */
export function MobileNav() {
  const pathname = usePathname() ?? "/";

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {/* five entries fit every phone width - flex-1 each, evenly spread, no horizontal scroll */}
      <ul className="flex px-1">
        {NAV.map((n) => {
          const active = isActive(pathname, n.href);
          const Icon = ICONS[n.href] ?? Target;
          return (
            <li key={n.href} className="flex-1">
              <Link
                href={n.href}
                aria-current={active ? "page" : undefined}
                className="flex w-full"
              >
                <NavCell Icon={Icon} label={n.short} active={active} />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
