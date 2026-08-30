import type { CSSProperties } from "react";

// A few gold shades. Pieces are a deterministic, index-derived set (no Math.random) so the server and
// client markup match exactly, no hydration mismatch. Kept as literals (not tokens) so the shade set is
// asserted directly by web/test/confetti_dom.mjs; tokenizing would only rewrite the markup string with
// zero pixel change yet break that DOM pin.
// hex-guard-ok: fixed gold celebration palette (decorative confetti), fixed-art shades like Flag.tsx.
const GOLD = ["#eab308", "#fbbf24", "#f59e0b", "#fde68a", "#ca8a04"];
const COUNT = 30;

// Which particle indices render as a falling icon instead of a rectangle. Fixed (not random) so
// the SSR and client markup stay identical and the icon scatter is tasteful (a few, not a swarm).
// Trophy indices celebrate the title; star indices add sparkle.
const TROPHY_AT = new Set([4, 16, 25]);
const STAR_AT = new Set([9, 20]);

type PieceVars = CSSProperties & Record<string, string | number>;

function piece(i: number, shades: string[]): PieceVars {
  const ribbon = i % 4 === 0; // ~1 in 4 is a thin ribbon strip; the rest small confetti
  const dur = 5 + (i % 5); // 5-9s
  const delay = -(((i * 1.7) % dur)); // negative -> the fall is already populated at load
  const w = ribbon ? 3 : 4 + (i % 3); // px
  const h = ribbon ? 12 + (i % 7) : 4 + (i % 3);
  const sway = (i % 2 ? 1 : -1) * (8 + (i % 11)); // px horizontal drift
  const spin = (i % 2 ? 1 : -1) * (200 + (i % 3) * 160); // deg
  return {
    "--cx": `${(i * 36.7) % 100}%`,
    "--cy": `${(i * 23) % 100}%`, // resting position for the reduced-motion fallback
    "--cw": `${w}px`,
    "--ch": `${h}px`,
    "--cc": shades[i % shades.length],
    "--cr": ribbon ? "1px" : "1.5px",
    "--co": ribbon ? 0.5 : 0.8,
    "--crot": `${(i * 53) % 360}deg`,
    "--cdur": `${dur}s`,
    "--cdelay": `${delay}s`,
    "--csway": `${sway}px`,
    "--cspin": `${spin}deg`,
  };
}

/** Variable set for a falling icon piece: same motion vars as a rectangle, sized a touch larger so
 *  the SVG reads, and given a single fill colour drawn from the shade set. Deterministic by index. */
function iconPiece(i: number, shades: string[]): PieceVars {
  const dur = 5 + (i % 5);
  const delay = -(((i * 1.7) % dur));
  const size = 12 + (i % 3) * 2; // 12-16px, larger than rectangles so the glyph is legible
  const sway = (i % 2 ? 1 : -1) * (8 + (i % 11));
  const spin = (i % 2 ? 1 : -1) * (200 + (i % 3) * 160);
  return {
    "--cx": `${(i * 36.7) % 100}%`,
    "--cy": `${(i * 23) % 100}%`,
    "--cw": `${size}px`,
    "--ch": `${size}px`,
    "--cc": shades[i % shades.length],
    "--co": 0.9,
    "--crot": `${(i * 53) % 360}deg`,
    "--cdur": `${dur}s`,
    "--cdelay": `${delay}s`,
    "--csway": `${sway}px`,
    "--cspin": `${spin}deg`,
  };
}

/** A small inline trophy/cup glyph. Inherits its colour from currentColor so it picks up the
 *  shade applied on the piece. */
function TrophyGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden focusable="false">
      <path d="M6 4h12v2h3v3a4 4 0 0 1-4 4h-.4a6 6 0 0 1-3.6 3.1V18h3v2H8v-2h3v-1.9A6 6 0 0 1 7.4 13H7a4 4 0 0 1-4-4V6h3V4zm0 4H5v1a2 2 0 0 0 1 1.7V8zm12 0v2.7A2 2 0 0 0 19 9V8h-1z" />
    </svg>
  );
}

/** A small inline 5-point star/sparkle glyph. Inherits its colour from currentColor. */
function StarGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="100%" height="100%" fill="currentColor" aria-hidden focusable="false">
      <path d="M12 2l2.6 6.3L21 9l-4.8 4.1L17.6 20 12 16.5 6.4 20l1.4-6.9L3 9l6.4-.7L12 2z" />
    </svg>
  );
}

/** Looping confetti + ribbon fall (plus a few falling trophy/star glyphs) for the champion hero.
 *  Pure CSS (keyframes in globals.css); contained + behind content; reduced-motion -> static scatter.
 *
 *  `shades` lets a caller tint the particles to a team's flag colours (see lib/flagColors
 *  flagConfettiShades). With no prop it defaults to the existing gold set so any other caller keeps
 *  the unchanged gold behaviour. Particle colour, position, delay and which index is an icon are all
 *  derived deterministically from the index (no Math.random) so SSR and client markup match. */
export function Confetti({ shades }: { shades?: string[] } = {}) {
  const palette = shades && shades.length > 0 ? shades : GOLD;
  return (
    <div className="confetti-layer" aria-hidden>
      {Array.from({ length: COUNT }, (_, i) => {
        if (TROPHY_AT.has(i)) {
          return (
            <span key={i} className="confetti-piece confetti-icon" style={iconPiece(i, palette)}>
              <TrophyGlyph />
            </span>
          );
        }
        if (STAR_AT.has(i)) {
          return (
            <span key={i} className="confetti-piece confetti-icon" style={iconPiece(i, palette)}>
              <StarGlyph />
            </span>
          );
        }
        return <span key={i} className="confetti-piece" style={piece(i, palette)} />;
      })}
    </div>
  );
}
