import { notFound } from "next/navigation";
import { getTeamProfile, teamStaticParams, getTeamsIndex } from "@/lib/data/teams";
import { getTeamPlayers } from "@/lib/data/players";
import { getTitleOddsHistory, type TitleOddsHistory } from "@/lib/data/titleOddsHistory";
import { TeamProfileView } from "@/components/teams/TeamProfileView";
import type { TeamPlayerLink } from "@/lib/data/players";
import type { TeamsIndex } from "@/lib/types/teams";

// Prerender all 48 team ids; only those resolve (unknown slugs → 404). Public reads are cookie-free,
// so the pages are statically generated and refreshed on a 5-minute ISR window.
export const dynamicParams = false;
export const revalidate = 300;

export function generateStaticParams() {
  return teamStaticParams();
}

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const profile = await getTeamProfile(id);
  if (!profile) notFound();
  // Cross-link: the team's tracked players (fails soft to [] → the section simply hides).
  let keyPlayers: TeamPlayerLink[] = [];
  try {
    keyPlayers = await getTeamPlayers(profile.team);
  } catch (err) {
    console.error("Failed to load team players:", err);
  }
  // Odds-over-time inputs for the ported Title Race strip. Both fail soft to null so the strip (and
  // only the strip) hides when the history/index is unavailable - the rest of the page still renders.
  let titleHistory: TitleOddsHistory | null = null;
  let teamsIndex: TeamsIndex | null = null;
  const [histRes, idxRes] = await Promise.allSettled([getTitleOddsHistory(), getTeamsIndex()]);
  if (histRes.status === "fulfilled") titleHistory = histRes.value;
  else console.error("Failed to load title-odds history:", histRes.reason);
  if (idxRes.status === "fulfilled") teamsIndex = idxRes.value;
  else console.error("Failed to load teams index:", idxRes.reason);

  return (
    <TeamProfileView
      profile={profile}
      keyPlayers={keyPlayers}
      titleHistory={titleHistory}
      teamsIndex={teamsIndex}
    />
  );
}
