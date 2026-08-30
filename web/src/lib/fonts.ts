// The three site fonts, declared ONCE (Wave 16, T1 chrome seam).
//
// The app upstream has TWO sibling root layouts, because a second surface needs its own chrome
// rather than nesting inside the World Cup AppFrame. Only the World Cup one is published. Both put
// the same three CSS variables on <html>, and next/font must be called exactly once per family:
// calling Inter() in two modules would load two copies of the same variable font and emit two
// different generated classes for the same face. So the calls live here and both layouts import
// them.
//
// The call arguments are UNCHANGED from the original app/layout.tsx, character for character, so
// the emitted @font-face rules and the --font-* variable names are the same as before the split.
// All three are VARIABLE fonts: next/font loads one variable file per family covering the whole
// weight axis, so the UI's 400/500/600/700 are already served from a single file each (no per-weight
// requests to subset). subsets: latin trims the glyph set; display: swap avoids invisible text.
import { Inter, Space_Grotesk, JetBrains_Mono } from "next/font/google";

export const inter = Inter({ variable: "--font-inter", subsets: ["latin"], display: "swap" });
export const display = Space_Grotesk({ variable: "--font-display", subsets: ["latin"], display: "swap" });
export const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], display: "swap" });

/** The class list both root layouts put on <html>, so the font wiring cannot drift between them. */
export const FONT_VARIABLES = `${inter.variable} ${display.variable} ${mono.variable}`;
