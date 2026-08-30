import type { Metadata } from "next";
import "../globals.css";
import "flag-icons/css/flag-icons.min.css";
import { AppFrame } from "@/components/layout/AppFrame";
import { FONT_VARIABLES } from "@/lib/fonts";

// This file moved from app/layout.tsx to app/(wc)/layout.tsx so that a second
// surface can have a SIBLING root layout with its own chrome instead of nesting inside AppFrame.
// A route group adds no URL segment, so every WC route resolves at exactly the same path as before.
// The only edits are the two that the move forces: the globals.css import is now one level up, and
// the three next/font calls moved to @/lib/fonts so they are declared ONCE and shared with the other
// root layout (same arguments, same --font-* variables). Everything else below is untouched.
//
// WC output was measured before and after the move against a calibrated normaliser: visible text
// identical on all six sampled routes, DOM identical on five. It was NOT byte-identical, and the
// residuals are enumerated in docs/WAVE16_STATUS.md T1 rather than glossed. Two of them were real
// regressions found by adversarial review and are now fixed and guarded:
// the WC OG and twitter image URLs (301s in next.config.ts keep the pre-move URLs alive) and the
// hard 404 losing its root layout (app/global-not-found.tsx). web/test/wc_chrome_parity.mjs asserts
// those specific properties; it does not, and never did, assert byte-identity.

// Absolute base for OG/Twitter URLs. Env-driven (set NEXT_PUBLIC_SITE_URL=https://presaira.com in
// Vercel); the literal fallback guarantees correct absolute card URLs even if the env var is absent.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://presaira.com";
// Short card description (<=125 chars) so it doesn't truncate on mobile social cards. The longer
// SEO description below stays as the <meta name="description">.
const CARD_DESCRIPTION =
  "Calibrated, probabilistic AI forecasts for every World Cup 2026 match and the tournament.";

const BRAND_TITLE = "Presaira: World Cup 2026 Live Prediction Engine";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Presaira is the brand suffix; "World Cup 2026" stays the descriptive lead for search. Per-page
  // metadata sets just the page name (e.g. "Forecast") and the template supplies the rest.
  title: {
    template: "%s · World Cup 2026 · Presaira",
    default: BRAND_TITLE,
  },
  description:
    "A calibrated, probabilistic AI forecast for every World Cup 2026 match and the tournament. Independent, not affiliated with FIFA.",
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Presaira",
    title: BRAND_TITLE,
    description: CARD_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: BRAND_TITLE,
    description: CARD_DESCRIPTION,
  },
};

// Runs before paint: set data-theme from localStorage, else default to light. Honors the three
// themes (light, dark, midnight); an unknown/absent value falls back to light. Setting the
// attribute once, pre-paint, means midnight paints true-black directly with no navy-then-black
// flash. No FOUC.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');if(t!=='light'&&t!=='dark'&&t!=='midnight'){t='light';}document.documentElement.setAttribute('data-theme',t);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`;

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${FONT_VARIABLES} h-full`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full">
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
