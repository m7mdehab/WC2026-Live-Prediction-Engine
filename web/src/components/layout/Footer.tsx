import Link from "next/link";

export function Footer() {
  return (
    <footer className="mt-10 border-t border-border bg-bg-subtle">
      {/* mobile: bottom padding clears the fixed MobileNav plus the iOS home-indicator
          safe area; lg+ hides the nav, so plain pb-8 applies there */}
      <div className="mx-auto max-w-[1280px] space-y-2 px-4 pt-8 pb-[calc(4rem+env(safe-area-inset-bottom))] text-sm text-muted md:px-6 lg:pb-8">
        <p>
          An independent, calibrated AI forecast.{" "}
          <span className="text-secondary">Not affiliated with FIFA</span> or any official
          World Cup organisation.
        </p>
        <p>
          For interest and analysis only:{" "}
          <span className="text-secondary">not betting advice</span>.
        </p>
        <p className="text-xs">
          <Link href="/methodology" className="text-secondary underline-offset-2 hover:underline">
            Methodology
          </Link>
          {" "}· how the forecast is built.
        </p>
        <p className="pt-2 text-xs">
          Built by{" "}
          <a
            href="https://www.linkedin.com/in/mohammed-ehab/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-confident hover:underline"
          >
            Mohammed Ehab Elnomany
          </a>{" "}
          · probabilistic, not an oracle.
        </p>
      </div>
    </footer>
  );
}
