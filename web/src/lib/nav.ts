// The 4-page consolidated IA (plus home via the logo). /teams and /methodology stay live but are
// reached through in-page links (groups/forecast team links; the footer Methodology link). Old
// URLs (/bracket, /ai-vs-humans, /daily) 301 in next.config.ts. Admin is unlinked/protected.
export const NAV: { href: string; label: string; short: string }[] = [
  { href: "/forecast", label: "Forecast", short: "Forecast" },
  { href: "/matches", label: "Matches", short: "Matches" },
  { href: "/groups", label: "Groups", short: "Groups" },
  { href: "/predict", label: "Predict", short: "Predict" },
  { href: "/players", label: "Players", short: "Players" },
];
