// Canonical team-name -> URL-slug helper, shared by the /teams route (slug source of truth) and
// every page that links to /teams/[id]. Pure (no server-only marker, no deps) so it is safe to
// import from client OR server components -- link construction must NOT pull in the server-only
// data layer. Diacritics are folded ("Curacao" -> "curacao"); spaces/punctuation collapse to
// single hyphens. Keep byte-identical with generateStaticParams (lib/data/teams.ts) or links 404.
export function teamSlug(name: string): string {
  return name
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // strip combining marks (cedilla -> c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
