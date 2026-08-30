import { flagColor, FLAG_COLOR_FALLBACK } from "@/lib/flagColors";
import type { BracketMatch } from "@/lib/types";

/** Low-alpha tint of a nation's dominant colour (FLAG_COLOR_FALLBACK grey for null/unmapped). */
export function tint(team: string | null): string {
  const base = team ? flagColor(team) : FLAG_COLOR_FALLBACK;
  return `color-mix(in srgb, ${base} 50%, transparent)`;
}
/** Normalized [w_a, w_draw, w_b] in percent summing to 100; even 40/20/40 split when no probabilities. */
export function segments(m: BracketMatch): [number, number, number] {
  const pa = m.p_a ?? 0; const pd = m.p_draw ?? 0; const pb = m.p_b ?? 0;
  const sum = pa + pd + pb;
  if (sum <= 0) return [40, 20, 40];
  return [(pa / sum) * 100, (pd / sum) * 100, (pb / sum) * 100];
}
