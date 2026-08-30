// Official FIFA 3-letter trigrams for the 48 WC2026 teams (FIFA country codes - e.g. GER/NED/SUI/
// RSA, not the ISO GER/NLD/CHE/ZAF). The teams table carries no code, so this is the canonical map.
// Used for the compact mobile match rows.
export const TEAM_CODE: Record<string, string> = {
  Argentina: "ARG", Australia: "AUS", Austria: "AUT", Belgium: "BEL",
  "Bosnia and Herzegovina": "BIH", Brazil: "BRA", Canada: "CAN", "Cape Verde": "CPV",
  Colombia: "COL", Croatia: "CRO", "Curaçao": "CUW", "Czech Republic": "CZE",
  "DR Congo": "COD", Ecuador: "ECU", Egypt: "EGY", England: "ENG",
  France: "FRA", Germany: "GER", Ghana: "GHA", Haiti: "HAI",
  Iran: "IRN", Iraq: "IRQ", "Ivory Coast": "CIV", Japan: "JPN",
  Jordan: "JOR", Mexico: "MEX", Morocco: "MAR", Netherlands: "NED",
  "New Zealand": "NZL", Norway: "NOR", Panama: "PAN", Paraguay: "PAR",
  Portugal: "POR", Qatar: "QAT", "Saudi Arabia": "KSA", Scotland: "SCO",
  Senegal: "SEN", "South Africa": "RSA", "South Korea": "KOR", Spain: "ESP",
  Sweden: "SWE", Switzerland: "SUI", Tunisia: "TUN", Turkey: "TUR",
  "United States": "USA", Uruguay: "URU", Uzbekistan: "UZB", Algeria: "ALG",
};

/** FIFA trigram for a team; falls back to the first three letters uppercased. */
export function teamCode(team: string): string {
  return TEAM_CODE[team] ?? team.slice(0, 3).toUpperCase();
}
