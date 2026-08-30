import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  emptyAuto, formatDateLabel, getDailyBriefing, dateSpan,
  TOURNAMENT_START, TOURNAMENT_END, type DailyBriefing,
} from "@/lib/data/daily";
import { isSeasonFrozen } from "@/lib/data/freeze";
import { DailyBriefingView } from "@/components/daily/DailyBriefingView";

// ISR + prebuilt (Track C static seal). generateStaticParams prebuilds every tournament UTC date WHEN the
// season is frozen; a future LIVE season returns [] so nothing is prebuilt and dynamicParams renders each
// on demand - reversible via isFrozen, NO date. The date range is dateSpan(TOURNAMENT_START..END), DB-free
// constants, so the enumerator adds no build read. The static "day" segment still wins over /matches/[id].
export const revalidate = 3600;
export const dynamicParams = true;
export async function generateStaticParams(): Promise<{ date: string }[]> {
  if (!(await isSeasonFrozen())) return [];
  return dateSpan(TOURNAMENT_START, TOURNAMENT_END).map((date) => ({ date }));
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(raw: string): string | null {
  const date = decodeURIComponent(raw);
  // The route segment is a UTC calendar date (YYYY-MM-DD); reject anything else.
  if (!DATE_RE.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) return null;
  return date;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>;
}): Promise<Metadata> {
  const { date: raw } = await params;
  const date = validDate(raw);
  if (!date) return {};
  return {
    title: formatDateLabel(date),
    description: `World Cup 2026 fixtures, model odds, results, and the auto-generated matchday briefing for ${formatDateLabel(date)}.`,
    alternates: { canonical: `/matches/day/${date}` },
  };
}

export default async function MatchDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date: raw } = await params;
  const date = validDate(raw);
  if (!date) notFound();

  let briefing: DailyBriefing;
  try {
    briefing = await getDailyBriefing(date);
  } catch (err) {
    console.error(`Failed to load daily briefing for ${date}:`, err);
    briefing = { date, fixtures: [], source: "static", inWindow: false, auto: emptyAuto(), watchingLabel: null };
  }
  return <DailyBriefingView briefing={briefing} />;
}
