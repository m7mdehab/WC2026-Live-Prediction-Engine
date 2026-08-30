// Stadium → IANA timezone for the 16 WC2026 venues (data/venues_2026.json), so a match page can
// show the venue-local kickoff alongside the visitor's local time. Keyed by stadium name (the web
// Fixture has venue/city/country but no venue_id; stadium names are unique). Mexico abolished DST in
// 2022, so its zones sit at a fixed offset.
export const VENUE_TZ: Record<string, string> = {
  "BMO Field": "America/Toronto",            // Toronto
  "BC Place": "America/Vancouver",           // Vancouver
  "Estadio Azteca": "America/Mexico_City",   // Mexico City
  "Estadio Akron": "America/Mexico_City",    // Guadalajara / Zapopan
  "Estadio BBVA": "America/Monterrey",       // Monterrey / Guadalupe
  "Mercedes-Benz Stadium": "America/New_York", // Atlanta
  "Gillette Stadium": "America/New_York",      // Boston / Foxborough
  "AT&T Stadium": "America/Chicago",           // Dallas / Arlington
  "NRG Stadium": "America/Chicago",            // Houston
  "Arrowhead Stadium": "America/Chicago",      // Kansas City
  "SoFi Stadium": "America/Los_Angeles",       // Los Angeles / Inglewood
  "Hard Rock Stadium": "America/New_York",     // Miami / Miami Gardens
  "MetLife Stadium": "America/New_York",       // New York / East Rutherford
  "Lincoln Financial Field": "America/New_York", // Philadelphia
  "Levi's Stadium": "America/Los_Angeles",     // San Francisco / Santa Clara
  "Lumen Field": "America/Los_Angeles",        // Seattle
};

export function venueTz(venue: string | null): string | null {
  return venue ? VENUE_TZ[venue] ?? null : null;
}

/** Format a UTC kickoff in a fixed IANA timezone (deterministic - server-safe, no hydration risk). */
export function formatVenueLocal(iso: string | null, tz: string): { time: string; zone: string } | null {
  if (!iso) return null;
  const d = new Date(iso);
  const time = new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz,
  }).format(d);
  const zone =
    new Intl.DateTimeFormat("en-GB", { timeZoneName: "short", timeZone: tz })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value ?? "";
  return { time, zone };
}
