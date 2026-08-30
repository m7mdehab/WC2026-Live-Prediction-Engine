import Link from "next/link";

/** A live feature card: title + one-line teaser + a "→" affordance linking to a shipped page.
 *  Same structural pattern as the gold "Predict your bracket" CTA, in a neutral palette so that
 *  primary action stays the hero. (The legacy smoke-test ChampionHero / TitleRace / Placeholder
 *  panels were removed in the IA consolidation - zero usages.) */
export function FeatureCard({
  href, title, teaser, cta,
}: { href: string; title: string; teaser: string; cta: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center justify-between gap-3 rounded-card border border-border bg-surface p-4 shadow-[var(--shadow-card)] transition-colors hover:border-confident"
    >
      <div className="min-w-0">
        <div className="font-display text-base font-semibold text-fg">{title}</div>
        <p className="mt-0.5 text-xs leading-relaxed text-secondary">{teaser}</p>
      </div>
      <span className="shrink-0 rounded-full border border-border px-4 py-2 text-sm font-semibold text-confident transition-colors group-hover:border-confident">
        {cta} →
      </span>
    </Link>
  );
}
