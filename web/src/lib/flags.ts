// Canonical team name -> flag-icons code. England/Scotland/Wales use the GB sub-region
// flags (gb-eng / gb-sct / gb-wls), never the Union Jack. Covers all 48 WC2026 teams.
export const TEAM_FLAG: Record<string, string> = {
  Mexico: "mx", "South Africa": "za", "South Korea": "kr", "Czech Republic": "cz",
  Canada: "ca", "Bosnia and Herzegovina": "ba", Qatar: "qa", Switzerland: "ch",
  Brazil: "br", Morocco: "ma", Haiti: "ht", Scotland: "gb-sct",
  "United States": "us", Paraguay: "py", Australia: "au", Turkey: "tr",
  Germany: "de", "Curaçao": "cw", "Ivory Coast": "ci", Ecuador: "ec",
  Netherlands: "nl", Japan: "jp", Sweden: "se", Tunisia: "tn",
  Belgium: "be", Egypt: "eg", Iran: "ir", "New Zealand": "nz",
  Spain: "es", "Cape Verde": "cv", "Saudi Arabia": "sa", Uruguay: "uy",
  France: "fr", Senegal: "sn", Iraq: "iq", Norway: "no",
  Argentina: "ar", Algeria: "dz", Austria: "at", Jordan: "jo",
  Portugal: "pt", "DR Congo": "cd", Uzbekistan: "uz", Colombia: "co",
  England: "gb-eng", Croatia: "hr", Ghana: "gh", Panama: "pa",
  // supported even though not in the 48, per the design brief
  Wales: "gb-wls", "Northern Ireland": "gb-nir",
};

// Explicit aliases for nation strings the data carries that are not the canonical
// map key (e.g. player rows say "USA" while the map key is "United States", and
// "Cote d'Ivoire" instead of the canonical "Ivory Coast"). Keys here are matched
// after the same normalize() that the live nation strings pass through, so casing,
// surrounding whitespace, and diacritics are already folded away.
const NATION_ALIAS: Record<string, string> = {
  // United States: every form the player feed (and humans) might use.
  usa: "us",
  "united states": "us",
  "united states of america": "us",
  us: "us",
  america: "us",
  // Cote d'Ivoire: data ships the French name (with or without the o-circumflex);
  // the canonical map only has "Ivory Coast".
  "cote divoire": "ci",
  "cote d ivoire": "ci",
  "ivory coast": "ci",
  // Curacao: covered by the canonical map (precomposed cedilla), aliased here too
  // so a no-cedilla "Curacao" still resolves.
  curacao: "cw",
};

// Accent-insensitive, case-insensitive, whitespace-tolerant key. We fold the
// apostrophe and collapse internal whitespace so "Cote  d'Ivoire" and
// "cote d ivoire" land on the same key. England/Scotland/Wales survive this
// (they carry no diacritics) and keep their distinct gb-eng/gb-sct/gb-wls codes
// because the canonical exact-match lookup runs first and the normalized map below
// preserves each one as a separate key.
function normalize(s: string): string {
  return s
    .normalize("NFD") // split base letters from combining diacritics
    .replace(/[̀-ͯ]/g, "") // drop the combining marks (accents)
    .toLowerCase()
    .replace(/['‘’]/g, "") // drop straight and curly apostrophes
    .replace(/\s+/g, " ") // collapse runs of whitespace
    .trim();
}

// Normalized form of the canonical map, built once. Lets a casing/spacing/accent
// variant of a real team name (e.g. "curacao" for "Curaçao") resolve without an
// explicit alias. England/Scotland/Wales normalize to distinct keys so they keep
// their separate sub-region codes.
const NORMALIZED_TEAM_FLAG: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const [name, code] of Object.entries(TEAM_FLAG)) {
    out[normalize(name)] = code;
  }
  // explicit aliases win over (or fill gaps beside) the normalized canonical names
  for (const [key, code] of Object.entries(NATION_ALIAS)) {
    out[normalize(key)] = code;
  }
  return out;
})();

// Resolve a nation/team string to a flag-icons code, or null if genuinely unknown.
// Lookup order: exact canonical match (fastest, preserves every byte) -> normalized
// match (case/space/accent insensitive, covers aliases). Returns null only when no
// form of the input maps to a real flag.
export function flagCode(team: string): string | null {
  if (!team) return null;
  const exact = TEAM_FLAG[team];
  if (exact) return exact;
  return NORMALIZED_TEAM_FLAG[normalize(team)] ?? null;
}
