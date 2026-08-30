import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/Card";
import { Flag } from "@/components/ui/Flag";
import { actualTierColor } from "@/lib/actualTier";
import { medalBorderClass } from "@/lib/players";
import type { AwardRaceEntry } from "@/lib/types/players";

// How many scorers the home card surfaces.
const TOP_N = 5;

// Honest placeholder for a missing number (never render null/NaN/undefined).
const DASH = "-";

/** Coerce a possibly-NaN actual to an honest finite goal count (summed actuals default to 0). */
function safeActual(n: number | undefined): number {
  return Number.isFinite(n) ? (n as number) : 0;
}

/** Render the actual count honestly: a finite number, else a dash placeholder (NEVER NaN). */
function fmtActual(n: number): string {
  return Number.isFinite(n) ? String(n) : DASH;
}

/** Render the model expected goals to one decimal, or a dash placeholder when not projected. A player
 *  with actual goals but no/zero expected (value 0.0) shows the dash, e.g. "3 / - exp". */
function fmtExpected(n: number | null): string {
  return n != null && Number.isFinite(n) && n > 0 ? n.toFixed(1) : DASH;
}

/** One scorer row: flag + name on the left, "actual / expected exp" on the right. The numbers stay
 *  honest: a player with no goals yet reads "0", a player with no projection reads "-". The actual
 *  number is colour-coded via the shared tier helper (red zero / amber rising / green meeting / neutral
 *  no-projection); colour is a redundant signal only, the number itself never goes away. The expected
 *  value is the Golden Boot board metric = expected GOALS (entry.expectedValue), so a cross-role scorer
 *  (e.g. an MF) shows their expected goals here, not their role-headline (which for an MF would be
 *  expected assists). This matches the /players Golden Boot card exactly. Dash when the model has none.
 *  `rank` is the 1-based board rank (leading number, tabular-nums); the top three rows carry a faint
 *  gold/silver/bronze medal border (shared medalBorderClass), ranks 4+ keep the neutral card border. */
function Row({ entry, rank }: { entry: AwardRaceEntry; rank: number }) {
  const actual = safeActual(entry.actual);
  // Compare/display actual goals against EXPECTED GOALS = the board's expectedValue (NOT the role
  // headline, which for an MF is expected assists). null/0 -> dash. Tier colour keys off the same value
  // so the home card and the /players Golden Boot card read identically.
  const expected = entry.expectedValue;
  const expectedForTier = expected != null && expected > 0 ? expected : null;
  const actualColor = actualTierColor(actual, expectedForTier).className;
  return (
    <li
      data-boot-row={rank}
      className={`flex items-center gap-2 rounded-md border px-2 py-1 text-sm ${medalBorderClass(rank)}`}
    >
      <span className="tnum w-3 shrink-0 text-right text-xs font-semibold text-muted">{rank}</span>
      <Flag team={entry.nation} size="text-base" />
      <span className="min-w-0 flex-1 truncate font-medium text-fg">{entry.name}</span>
      <span className="tnum shrink-0 text-xs text-secondary">
        <span className={`font-semibold ${actualColor}`}>{fmtActual(actual)}</span>
        {" / "}
        {fmtExpected(expected)} exp
      </span>
    </li>
  );
}

/** Home digest of the golden-boot race: the SAME Golden Boot board the /players award card renders
 *  (from getAwardRaces().goldenBoot), now filtered to ACTUAL scorers (real goals > 0) in the SAME
 *  actuals-first order (actual goals desc, then expected, then name) so the two surfaces AGREE -- a
 *  cross-role scorer (e.g. a 3-goal MF) appears on both. Each row pairs the goals actually scored with
 *  the model's expected ("2 / 3.0 exp", or "3 / - exp" when the model has no projection) so the reader
 *  can glance race-vs-forecast at once. Reads ONLY the precomputed board prop (the page threads
 *  getAwardRaces().goldenBoot in); no client fetching. Takes the top N. Pure + deterministic (no Date /
 *  random). When nobody has scored yet the card renders an HONEST empty state ("No goals scored yet"),
 *  never a blank card. */
export function GoldenBootRaceCard({ board }: { board: AwardRaceEntry[] }) {
  const leaders = board.slice(0, TOP_N);
  return (
    <Card>
      <CardHeader title="Golden Boot race" hint="actual / exp" />

      {leaders.length === 0 ? (
        <p className="text-sm text-muted">No goals scored yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {leaders.map((e, i) => (
            <Row key={e.playerId} entry={e} rank={i + 1} />
          ))}
        </ul>
      )}

      <Link
        href="/players"
        className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-gold-strong hover:underline"
      >
        See all scorers →
      </Link>
    </Card>
  );
}
