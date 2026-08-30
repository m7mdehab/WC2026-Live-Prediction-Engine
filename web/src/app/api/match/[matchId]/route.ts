import { NextResponse } from "next/server";
import { getMatchDetail } from "@/lib/data";

// Lazy detail endpoint for the expandable /matches rows - fetched on first expand and cached
// client-side (keeps the index payload light; see docs §render-choice).
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  try {
    const detail = await getMatchDetail(matchId);
    if (!detail) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(detail);
  } catch (err) {
    console.error("match detail api:", err);
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
