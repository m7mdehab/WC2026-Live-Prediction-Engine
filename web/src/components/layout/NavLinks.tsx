"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** The visible pill. useLinkStatus (valid only inside a <Link>) flips `pending` the instant the
 *  link is tapped, before the server route resolves - so the gold treatment lands immediately and
 *  the click feels acknowledged. The current route stays gold via `active`. Colour-only change,
 *  motion-safe, so reduced-motion users still get the state with no animation. */
function NavPill({ label, active }: { label: string; active: boolean }) {
  const { pending } = useLinkStatus();
  const on = active || pending;
  return (
    <span
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium motion-safe:transition-colors",
        on ? "bg-gold/10 text-gold" : "text-secondary hover:bg-elevated hover:text-fg"
      )}
    >
      {label}
    </span>
  );
}

/** Desktop top nav - centered; hidden on mobile (mobile uses the bottom nav). Prefetch is on by
 *  default for in-viewport <Link>s. */
export function NavLinks() {
  const pathname = usePathname() ?? "/";
  return (
    <nav className="hidden items-center justify-center gap-1 lg:flex">
      {NAV.map((n) => {
        const active = pathname === n.href || pathname.startsWith(`${n.href}/`);
        return (
          <Link key={n.href} href={n.href} aria-current={active ? "page" : undefined}>
            <NavPill label={n.label} active={active} />
          </Link>
        );
      })}
    </nav>
  );
}
