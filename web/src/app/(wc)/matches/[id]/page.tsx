import { permanentRedirect } from "next/navigation";

// Spec route alias: /matches/[id] → canonical /match/[matchId]. Keeps deep links + the spec's
// naming resolving while the canonical page stays at /match/[id].
export default async function MatchesIdAlias({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  permanentRedirect(`/match/${id}`);
}
