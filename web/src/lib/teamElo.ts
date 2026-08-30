// Per-team Elo for the 48 WC2026 teams - a snapshot of model/elo_ratings.csv (the locked
// model-v1.0 ratings), exposed to the web so the group why-line uses the same rating signal as the
// match pages. Regenerate from elo_ratings.csv if the model is re-rated.
export const TEAM_ELO: Record<string, number> = {
  Algeria: 1823, Argentina: 2144, Australia: 1858, Austria: 1842,
  Belgium: 1928, "Bosnia and Herzegovina": 1625, Brazil: 2043, Canada: 1851,
  "Cape Verde": 1654, Colombia: 1982, Croatia: 1953, "Curaçao": 1564,
  "Czech Republic": 1752, "DR Congo": 1709, Ecuador: 1915, Egypt: 1801,
  England: 2033, France: 2109, Germany: 1971, Ghana: 1631,
  Haiti: 1645, Iran: 1871, Iraq: 1738, "Ivory Coast": 1776,
  Japan: 1949, Jordan: 1724, Mexico: 1915, Morocco: 1949,
  Netherlands: 1996, "New Zealand": 1740, Norway: 1871, Panama: 1823,
  Paraguay: 1841, Portugal: 1987, Qatar: 1624, "Saudi Arabia": 1678,
  Scotland: 1765, Senegal: 1902, "South Africa": 1629, "South Korea": 1870,
  Spain: 2159, Sweden: 1746, Switzerland: 1917, Tunisia: 1733,
  Turkey: 1881, "United States": 1832, Uruguay: 1946, Uzbekistan: 1779,
};

export function teamElo(team: string): number | null {
  return TEAM_ELO[team] ?? null;
}
