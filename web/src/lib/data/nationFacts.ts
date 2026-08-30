// Per-nation editorial facts for the home hero's "next match" mode.
//
// PROVENANCE (read this before touching): these are a SMALL, CURATED, STATIC set, one short line
// per nation, hand-written and stored in-repo. There is NO live per-nation fact feed wired into the
// web app (the historical corpus is not fetched here), so we do NOT synthesize live-looking "facts".
// The UI labels this line as an editorial note so a reader never mistakes it for live model output.
// Same pattern and spirit as lib/data/facts_2026.ts (the PM-curated tournament-facts pool).
//
// Style rules that keep the guards green: no em-dash (U+2014) anywhere; plain prose; one sentence.
// Keys are the exact team names used across the app (see lib/teamCodes.ts, the 48 WC2026 nations).
// If a nation has no entry, nationFact() returns null and the UI simply omits the line (fail-soft).

export const NATION_FACTS: Record<string, string> = {
  Argentina: "Three-time world champions (1978, 1986 and 2022), with Messi lifting the trophy in Qatar.",
  Australia: "The Socceroos reached the Round of 16 in 2006 and again in 2022.",
  Austria: "Finished third at the 1954 World Cup, still their best finish.",
  Belgium: "A golden generation carried Belgium to third place in 2018, their best result.",
  "Bosnia and Herzegovina": "Made their sole World Cup appearance in 2014, three years after independence recognition.",
  Brazil: "The only nation to appear at every World Cup, and record five-time champions.",
  Canada: "Co-hosts in 2026; before Qatar 2022 their only finals had been Mexico 1986.",
  "Cape Verde": "The Blue Sharks, from a nation of around half a million people, reached their first World Cup for 2026.",
  Colombia: "Reached the quarter-finals in 2014, powered by James Rodriguez's Golden Boot.",
  Croatia: "Runners-up in 2018 and third in 2022, remarkable for a nation of under four million.",
  "Curaçao": "With a population near 150,000, among the smallest territories ever to reach a World Cup.",
  "Czech Republic": "As Czechoslovakia they were World Cup runners-up twice, in 1934 and 1962.",
  "DR Congo": "As Zaire in 1974, they were the first sub-Saharan African side at a World Cup.",
  Ecuador: "Reached the Round of 16 in 2006, thriving on their high-altitude qualifying form.",
  Egypt: "The first African nation ever to play at a World Cup, back in 1934.",
  England: "1966 world champions on home soil, still their only title.",
  France: "Two-time winners (1998 and 2018) and back-to-back finalists in 2018 and 2022.",
  Germany: "Four-time champions and a record eight-time finalist.",
  Ghana: "The Black Stars reached the 2010 quarter-finals, a penalty kick away from the semis.",
  Haiti: "Made their only World Cup appearance in 1974.",
  Iran: "Have qualified six times but are still chasing a first trip past the group stage.",
  Iraq: "Their sole World Cup was 1986; they later won the 2007 Asian Cup as huge underdogs.",
  "Ivory Coast": "The Elephants reached three straight World Cups from 2006 to 2014, their golden era.",
  Japan: "Topped a 2022 group containing Germany and Spain, beating both.",
  Jordan: "Reached their first World Cup for 2026 after a runners-up finish at the Asian Cup.",
  Mexico: "Co-hosts in 2026; the Estadio Azteca becomes the first stadium to host three World Cups.",
  Morocco: "The first African and Arab side to reach a World Cup semi-final, in 2022.",
  Netherlands: "Three-time runners-up (1974, 1978 and 2010) without ever winning the trophy.",
  "New Zealand": "The All Whites went unbeaten at the 2010 World Cup yet still exited in the group.",
  Norway: "Famously beat Brazil at the 1998 World Cup and have never lost to them.",
  Panama: "Made their World Cup debut at Russia 2018.",
  Paraguay: "Reached the quarter-finals in 2010, their deepest World Cup run.",
  Portugal: "Third on their 1966 debut, inspired by Eusebio's nine goals.",
  Qatar: "Hosted in 2022, the first World Cup ever held in the Arab world.",
  "Saudi Arabia": "Stunned eventual champions Argentina in the 2022 group stage.",
  Scotland: "Have reached eight World Cups but never advanced past the group stage.",
  Senegal: "Beat holders France on their 2002 debut and reached the quarter-finals.",
  "South Africa": "The first African nation to host a World Cup, in 2010.",
  "South Korea": "Reached the semi-finals as co-hosts in 2002, Asia's best World Cup finish.",
  Spain: "2010 world champions, a first title won in South Africa.",
  Sweden: "Runners-up as hosts in 1958, beaten in the final by Brazil.",
  Switzerland: "Hosted the high-scoring 1954 World Cup and have reached several knockout stages since.",
  Tunisia: "The first African side to win a World Cup match (1978), and beat France in 2022.",
  Turkey: "Finished third at the 2002 World Cup, where Hakan Sukur scored the fastest goal in the tournament's history.",
  "United States": "Semi-finalists at the very first World Cup in 1930, and 2026 co-hosts.",
  Uruguay: "Two-time champions who won the very first World Cup, at home, in 1930.",
  Uzbekistan: "Qualified for their first-ever World Cup for 2026.",
  Algeria: "Beat West Germany in 1982 in the match remembered as the Miracle of Gijon.",
};

/** The curated editorial fact for a nation, or null when we have none (the UI then omits the line). */
export function nationFact(team: string | null | undefined): string | null {
  if (!team) return null;
  return NATION_FACTS[team] ?? null;
}
