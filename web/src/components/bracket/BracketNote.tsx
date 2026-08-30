import Link from "next/link";

/** Shared legend for the projected bracket (desktop + mobile). The explanation of what "projected"
 *  means lives in methodology (Reading the forecast -> Projected bracket); the card keeps the legend
 *  plus a short caption that links there. */
export function BracketNote() {
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-[3px] border border-dashed border-border-strong" />
          projected slot
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-3 w-5 rounded-[3px] border border-gold ring-1 ring-gold" />
          projected champion&apos;s path
        </span>
      </div>
      <p className="mt-2 text-xs text-muted">
        Most-likely bracket; slots resolve to real teams as results land.{" "}
        <Link href="/methodology#forecast-reads" className="text-secondary underline hover:text-fg">
          How the projected bracket works
        </Link>
      </p>
    </>
  );
}
