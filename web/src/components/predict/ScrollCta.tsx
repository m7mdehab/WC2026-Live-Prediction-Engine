"use client";

/** An in-page anchor styled as a button that scrolls to `target` (e.g. "#picker"). Smooth-scrolls
 *  by default; under prefers-reduced-motion it jumps instantly. Falls back to the browser's native
 *  anchor jump if the target isn't on the page. Used for the prominent "make your own bracket"
 *  affordance so small-screen visitors who land on the comparison reach the picker in one tap. */
export function ScrollCta({
  target,
  className,
  children,
}: {
  target: string;
  className?: string;
  children: React.ReactNode;
}) {
  function onClick(e: React.MouseEvent<HTMLAnchorElement>) {
    if (typeof document === "undefined") return;
    const el = document.querySelector(target);
    if (!el) return; // no target on this page → let the default href jump handle it
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    history.replaceState(null, "", target);
  }

  return (
    <a href={target} onClick={onClick} className={className}>
      {children}
    </a>
  );
}
