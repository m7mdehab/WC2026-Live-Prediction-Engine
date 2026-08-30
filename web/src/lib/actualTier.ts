// Shared three-tier colour coding for "actual vs expected" on the race/leaderboard surfaces
// (home golden-boot card + players index). One source of truth so the home card and the index
// agree. Pure + deterministic; colour is a redundant signal (the number always stays visible).
//
// Tiers (on the headline ACTUAL value vs the model EXPECTED value):
//   expected == null        -> "none"     neutral (text-fg)        no projection to compare against
//   actual   == 0           -> "zero"     red (text-down)          has not produced yet
//   actual   >= expected    -> "meeting"  green (text-up)          meeting or beating the model
//   0 < actual < expected   -> "rising"   amber (text-upset)       on the board, below projection

export type ActualTier = "none" | "zero" | "rising" | "meeting";

/** Classify an actual value against its expected projection. expected null -> "none". */
export function actualTier(actual: number | null, expected: number | null): ActualTier {
  if (expected == null) return "none";
  const a = actual ?? 0;
  if (a === 0) return "zero";
  if (a >= expected) return "meeting";
  return "rising";
}

/** Tailwind text-colour class for a tier. Colour is never the only signal (the number stays). */
export function actualTierClass(tier: ActualTier): string {
  switch (tier) {
    case "zero":
      return "text-down";
    case "rising":
      return "text-upset";
    case "meeting":
      return "text-up";
    default:
      return "text-fg";
  }
}

/** Convenience: tier + class in one call. */
export function actualTierColor(actual: number | null, expected: number | null): {
  tier: ActualTier;
  className: string;
} {
  const tier = actualTier(actual, expected);
  return { tier, className: actualTierClass(tier) };
}
