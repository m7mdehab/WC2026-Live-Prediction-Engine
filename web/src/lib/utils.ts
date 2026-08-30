/** Minimal className combiner (no extra deps). */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * RAW fraction in [0,1] -> "11.1%", printed verbatim (a value at the extreme renders as an exact
 * "100.0%" / "0.0%"). This is the UNGUARDED formatter: use it ONLY for a quantity that is NOT a
 * Monte-Carlo outcome probability - a counted human-entry share, a signed difference (which can be
 * negative, where simPct would wrongly clamp it), a percentile, or a fixed axis gradation label.
 * Every call site must carry a `// raw-pct-ok: <reason>` sanction (enforced by
 * test/honest_probability_guard.mjs). For a sim-derived probability use simPct instead, so an
 * estimate never renders as a false certainty.
 */
export function rawPct(p: number | null | undefined, digits = 1): string {
  if (p == null || Number.isNaN(p)) return "—";
  return `${(p * 100).toFixed(digits)}%`;
}

/**
 * Display a MONTE-CARLO-derived probability in [0,1], but NEVER as an exact 100% or 0%. A 50000/50000
 * sim estimate is not a certainty - the true probability was never 100% (or 0%) - so a value that would
 * round to the extreme at `digits` precision renders as ">99.9%" / "<0.1%" (the largest/smallest
 * non-extreme value at that precision; at digits=0 that is ">99%" / "<1%"). A value that does NOT round
 * to the extreme keeps its honest decimal (e.g. 99.7%). This is the same honesty as the MC-zero false-
 * elimination guard, on the upper tail.
 *
 * Use this EVERYWHERE a sim-derived probability renders (forecast table live + "was NN%", the gauntlet,
 * the team title-odds card, resolved badges). Do NOT use it for a SETTLED result (render a check/cross -
 * a fact is not a probability) or for a percentile (a real 100th percentile is legitimate).
 */
export function simPct(p: number | null | undefined, digits = 1): string {
  if (p == null || Number.isNaN(p)) return "—";
  const step = Math.pow(10, -digits); // smallest representable step at this precision (1 at d=0, 0.1 at d=1)
  const rounded = Number((p * 100).toFixed(digits));
  if (rounded >= 100) return `>${(100 - step).toFixed(digits)}%`;
  if (rounded <= 0) return `<${step.toFixed(digits)}%`;
  return `${rounded.toFixed(digits)}%`;
}
