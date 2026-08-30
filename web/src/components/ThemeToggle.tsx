"use client";

import { useEffect, useState } from "react";
import { Sun, Moon, MoonStar } from "lucide-react";

type Theme = "light" | "dark" | "midnight";

// Cycle order and per-theme presentation. The button shows the CURRENT theme's icon and, on click,
// advances to the next theme in the ring (light -> dark -> midnight -> light). Sun = light,
// Moon = dark (navy), MoonStar = midnight (true black) - three legible, distinct glyphs.
const ORDER: Theme[] = ["light", "dark", "midnight"];
const META: Record<Theme, { Icon: typeof Sun; label: string }> = {
  light: { Icon: Sun, label: "Light" },
  dark: { Icon: Moon, label: "Dark" },
  midnight: { Icon: MoonStar, label: "Midnight" },
};

/** Three-state theme control. Sets data-theme on <html> and persists to localStorage. Initial
 *  value is read from the attribute the no-FOUC inline script already set, so the icon matches
 *  first paint. */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const attr = document.documentElement.getAttribute("data-theme");
    const current: Theme = attr === "dark" || attr === "midnight" ? attr : "light";
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(current);
    setMounted(true);
  }, []);

  function cycle() {
    const next = ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length];
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem("theme", next);
    } catch {}
    setTheme(next);
  }

  // Stable first-paint icon (light) until mounted, to avoid a hydration mismatch.
  const shown: Theme = mounted ? theme : "light";
  const { Icon } = META[shown];
  const next = ORDER[(ORDER.indexOf(shown) + 1) % ORDER.length];

  return (
    <button
      onClick={cycle}
      aria-label={`Theme: ${META[shown].label}. Switch to ${META[next].label}.`}
      title={`Theme: ${META[shown].label}`}
      className="grid h-9 w-9 place-items-center rounded-md border border-border text-secondary hover:bg-elevated hover:text-fg"
    >
      <Icon size={18} aria-hidden />
    </button>
  );
}
