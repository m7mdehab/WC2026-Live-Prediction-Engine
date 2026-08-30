import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { cn } from "@/lib/utils";

/** The minimal, PII-free slice of one scored entry the home card needs. Only the display_name from the
 *  bracket jsonb ever reaches the client - never email/linkedin/ip. `rank` is the TIE-AWARE displayed
 *  rank (entries on the same points share it); `joint` is true when this entry shares its rank with
 *  another (so the tie is shown explicitly). `isModel` marks the model competitor, which keeps the gold
 *  benchmark highlight and is pinned FIRST within its points tie - but never above a strictly higher
 *  human score (the pin is intra-tie only). */
export interface HumanRow {
  name: string;
  points: number;
  maxPoints: number;
  rank: number;
  joint: boolean;
  isModel: boolean;
}

/** Home table for AI vs Humans: every entry (incl. the model competitor) ranked together by
 *  round-weighted actuals-only points, with tie-aware JOINT ranks (1,1,1,4,...) and the model pinned
 *  first WITHIN its points tie (keeping the gold benchmark highlight). Any strictly higher human score
 *  outranks the model. The make-your-bracket CTA sits below. Renders sensibly for all-zero points
 *  (early tournament) and low entry counts alike. */
export function AiVsHumansCard({
  humans,
  aiChampion,
  mode,
  total,
  complete = false,
}: {
  humans: HumanRow[];
  aiChampion: string | null;
  mode: "projection" | "results";
  total: number;
  /** Tournament settled: the bracket game is closed, so the footer CTA points at the finished result
   *  instead of the (now closed) picker. The card also anchors #ai-vs-humans for the hero CTA. */
  complete?: boolean;
}) {
  return (
    <Card>
      {/* anchor target for the home hero's settled "See the final scores" CTA (#ai-vs-humans) */}
      <span id="ai-vs-humans" className="block scroll-mt-24" aria-hidden />
      <CardHeader
        title="AI vs Humans"
        hint={`${total} ${total === 1 ? "bracket" : "brackets"}`}
      />

      {humans.length > 0 ? (
        <ol className="space-y-0.5">
          {humans.map((h, i) => (
            <li
              key={`${h.name}-${i}`}
              className={cn(
                "flex items-center gap-2 rounded-md px-2 py-1.5",
                h.isModel ? "bg-gold-soft" : null,
              )}
              style={
                h.isModel
                  ? { borderLeft: "2px solid var(--gold)" }
                  : { borderLeft: "2px solid transparent" }
              }
            >
              <span
                className={cn(
                  "tnum w-6 shrink-0 text-center text-xs",
                  h.isModel ? "font-bold text-gold-strong" : "text-muted",
                )}
                title={h.joint ? `Joint ${h.rank}` : undefined}
              >
                <span aria-hidden>{h.joint ? "=" : ""}{h.rank}</span>
                <span className="sr-only">{h.joint ? `joint rank ${h.rank}` : `rank ${h.rank}`}</span>
              </span>
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-sm text-fg",
                  h.isModel ? "font-semibold" : "font-medium",
                )}
              >
                {h.name}
              </span>
              {h.isModel && aiChampion ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-secondary">
                  <Flag team={aiChampion} size="text-sm" />
                  <span className="hidden sm:inline">{aiChampion}</span>
                </span>
              ) : null}
              {h.isModel ? <Tag variant="gold">Benchmark</Tag> : null}
              <span className="tnum shrink-0 text-sm font-semibold text-fg">
                {h.points}
                <span className="text-[10px] font-normal text-muted">
                  {h.maxPoints > 0 ? ` / ${h.maxPoints} pts` : " pts"}
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-2 text-sm text-secondary">No brackets submitted yet. Be the first.</p>
      )}

      <p className="mt-2 text-xs text-muted">
        Round-weighted points vs {mode === "results" ? "the actual bracket" : "the model's bracket"}.{" "}
        <Link href="/predict#ai-vs-humans" className="text-secondary underline-offset-2 hover:underline">
          Full comparison →
        </Link>
      </p>

      {complete ? (
        <Link
          href="/predict#ai-vs-humans"
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-on-gold transition-colors hover:bg-gold-strong"
        >
          See the final AI vs humans board.
        </Link>
      ) : (
        <Link
          href="/predict"
          className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-on-gold transition-colors hover:bg-gold-strong"
        >
          Make your bracket. Beat the AI.
        </Link>
      )}
    </Card>
  );
}
