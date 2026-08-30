import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConstellationCup } from "@/components/brand/marks";
import { NavLinks } from "@/components/layout/NavLinks";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur">
      {/* Mobile (default): a simple two-item flex row. Logo left, toggle pushed to the right edge by
          justify-between (the nav is hidden here; the bottom nav handles it). This keeps the toggle
          conventionally right-aligned and never lets the bar overflow on small screens.
          Desktop (lg+): switch to a three-zone grid (logo left / nav centered / toggle right). The two
          outer columns are equal (1fr each) so the auto-width nav sits at the true horizontal centre
          of the bar, not just centred in the space left of the toggle. */}
      <div className="mx-auto flex h-14 max-w-[1280px] items-center justify-between gap-4 px-4 md:px-6 lg:grid lg:grid-cols-[1fr_auto_1fr] lg:justify-normal">
        <Link href="/" className="flex items-center gap-2 justify-self-start">
          {/* House mark: constellation cup (locked icon family), gold in both themes. */}
          <span className="grid h-7 w-7 place-items-center rounded-md bg-gold/15 text-gold">
            <ConstellationCup size={20} title="Presaira" />
          </span>
          {/* Wordmark = the Presaira brand; small tagline keeps the World Cup 2026 subject explicit. */}
          <span className="leading-none">
            <span className="block font-display text-base font-bold tracking-tight text-fg">Presaira</span>
            <span className="block text-[10px] font-medium tracking-wide text-secondary uppercase">
              World Cup 2026
            </span>
          </span>
        </Link>

        {/* Desktop nav - centered; hidden on mobile (mobile uses the bottom nav). Client component
            so a tapped item turns gold instantly (useLinkStatus pending) before the route resolves. */}
        <NavLinks />

        <div className="flex items-center justify-end gap-2 justify-self-end">
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
