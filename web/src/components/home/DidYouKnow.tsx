"use client";

import { useEffect, useRef, useState } from "react";
import { FACTS_2026 } from "@/lib/data/facts_2026";

const HOLD_MS = 4500;
const FADE_MS = 500;

function shuffled(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** A quiet one-line auto-fading footnote under the timeline (no chrome, no controls). Per-session
 *  shuffle, no repeat until the pool is exhausted. Decorative rotator: no aria-live; pauses on hover.
 *  Under prefers-reduced-motion it renders a single static fact (no rotation). */
export function DidYouKnow() {
  // identity order for the deterministic SSR/first-render frame; shuffled on mount.
  const [order, setOrder] = useState<number[]>(() => FACTS_2026.map((_, i) => i));
  const [pos, setPos] = useState(0);
  const [shown, setShown] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [paused, setPaused] = useState(false);
  const fadeRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // client-mount: shuffle + start rotation here (deterministic SSR frame above). Intentional.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setOrder(shuffled(FACTS_2026.length));
    setPos(0);
    setMounted(true);
  }, []);

  // auto cross-fade loop (off under reduced-motion: one static fact; paused while hovered)
  useEffect(() => {
    if (!mounted || reduced || paused) return;
    const id = setInterval(() => {
      setShown(false);
      if (fadeRef.current) clearTimeout(fadeRef.current);
      fadeRef.current = setTimeout(() => {
        setPos((p) => {
          const next = p + 1;
          if (next >= order.length) { setOrder(shuffled(FACTS_2026.length)); return 0; }
          return next;
        });
        setShown(true);
      }, FADE_MS);
    }, HOLD_MS + FADE_MS);
    return () => clearInterval(id);
  }, [mounted, reduced, paused, order]);

  const fact = FACTS_2026[order[pos]];

  return (
    <div
      className="overflow-hidden"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Block-level, fixed-measure, mx-auto centered track + text-center: a one-line fact and a
          wrapped multi-line fact are centered identically and the box never shifts with length
          (the old inline nowrap let a long fact extend past the centered box and drift right). */}
      <p
        className="mx-auto min-h-[1.5rem] max-w-prose text-center text-xs leading-relaxed text-balance text-secondary sm:text-sm"
        style={{ opacity: reduced ? 1 : shown ? 1 : 0, transition: reduced ? "none" : `opacity ${FADE_MS}ms ease` }}
      >
        {fact.text}
      </p>
    </div>
  );
}
