"use client";

import { useEffect, useState } from "react";

/** Renders the desktop dashboard OR the mobile feed (only ONE at a time once mounted), so the
 *  heavy/interactive/animated pieces (chart toggle state, hero confetti, client-side match
 *  grouping) don't double-render.
 *
 *  The shells are passed in as already-built nodes (server components rendered by the page), so
 *  this client controller only switches between them, and the shells stay server-side.
 *
 *  Trade-off (flagged): at SSR + first paint we render BOTH shells; their own `hidden lg:grid` /
 *  `lg:hidden` classes show the correct one immediately, so there is NO first-paint flash and the
 *  content is in the server HTML (SEO-clean). Right after mount we read the breakpoint and drop the
 *  inactive shell entirely → single steady-state render. Cost: one wasted hydration of the inactive
 *  shell on initial load (it's removed a tick later). This is the same initial DOM as the old
 *  CSS-hide approach, but converges to a single live instance instead of keeping two forever.
 */
export function HomeFeed({
  desktop,
  mobile,
}: {
  desktop: React.ReactNode;
  mobile: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)"); // Tailwind lg
    const sync = () => setIsDesktop(mq.matches);
    sync();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // SSR + first paint: both present; CSS classes on each shell pick the visible one (no flash).
  if (!mounted) {
    return (
      <>
        {desktop}
        {mobile}
      </>
    );
  }
  // Mounted: render only the active shell → one live instance of the heavy pieces.
  return <>{isDesktop ? desktop : mobile}</>;
}
