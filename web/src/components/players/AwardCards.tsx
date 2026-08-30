import Link from "next/link";
import { Flag } from "@/components/ui/Flag";
import { Tag } from "@/components/ui/Tag";
import { fmtMetric, fmtRating } from "@/lib/players";
import type { AwardRaceEntry, AwardRaces, AwardVerdict } from "@/lib/types/players";

/** How a card sources its headline figure. ACTUALS-FIRST boards (Golden Boot, Playmaker) lead with the
 *  player's real count (goals / assists) and show the model's expected as a muted secondary; MODEL-PICK
 *  boards (Golden Glove, POTM) lead with the model's expected value (no `actual` on those entries). */
type Mode = "actuals" | "expected";

/** Short unit suffix for an actuals-first figure ("G" for goals, "A" for assists) so a bare number is
 *  never misread. Empty for model-pick boards (their figure is a fractional expectation, no count unit). */
function unitFor(spec: AwardSpec): string {
  if (spec.mode !== "actuals") return "";
  return spec.key === "goldenBoot" ? "G" : spec.key === "playmaker" ? "A" : "";
}

/** The leader's headline figure. ACTUALS-FIRST: the real count (large), with the model's expected and
 *  its band as a muted secondary on the SAME line; an unprojected scorer (expectedValue null) shows the
 *  count with a small "actuals only" marker -- NEVER a bare dash that reads as no-data. MODEL-PICK: the
 *  expected value (large) with its band as a muted secondary. No wrap: secondary is small-font inline. */
function LeaderFigure({ spec, entry }: { spec: AwardSpec; entry: AwardRaceEntry }) {
  const unit = unitFor(spec);
  const hasBand = entry.bandLow != null && entry.bandHigh != null;
  const band = hasBand ? (
    <span className="ml-1 whitespace-nowrap text-muted">
      ({fmtMetric(entry.bandLow)}&ndash;{fmtMetric(entry.bandHigh)})
    </span>
  ) : null;

  if (spec.mode === "actuals") {
    const exp = entry.expectedValue;
    return (
      <span className="flex shrink-0 flex-col items-end leading-tight">
        <span className="tnum whitespace-nowrap font-display text-2xl font-bold text-fg">
          {fmtMetric(entry.actual)}
          {unit ? <span className="ml-0.5 align-baseline text-sm text-muted">{unit}</span> : null}
        </span>
        {exp == null ? (
          <span className="flex items-center gap-1 whitespace-nowrap text-[11px] text-muted">
            <span aria-hidden>exp &ndash;</span>
            <Tag variant="neutral" className="px-1.5 py-0 text-[10px]">Actuals only</Tag>
          </span>
        ) : (
          <span className="tnum whitespace-nowrap text-[11px] text-muted">
            <span>exp {fmtMetric(exp)}</span>
            {band}
          </span>
        )}
      </span>
    );
  }

  // MODEL-PICK: the expected value leads; its band is the muted secondary. fmtRating clamps the figure
  // to its 0-100 ceiling so a composite/index can never render above its own scale.
  const value = spec.valueOf(entry);
  return (
    <span className="flex shrink-0 flex-col items-end leading-tight">
      <span className="tnum whitespace-nowrap font-display text-2xl font-bold text-fg">
        {fmtRating(value)}
      </span>
      {band ? <span className="tnum whitespace-nowrap text-[11px] text-muted">{band}</span> : null}
    </span>
  );
}

/** One contender's figure, the COMPACT one-line variant of LeaderFigure for ranks 2+. ACTUALS-FIRST:
 *  the count (bold) with "exp x" muted inline (or a small "actuals only" marker when unprojected, never
 *  a bare dash). MODEL-PICK: the expected value (bold) with its band muted inline. Everything stays on
 *  ONE line (whitespace-nowrap) so the cluster densifies vertically without wrapping. */
function ContenderFigure({ spec, entry }: { spec: AwardSpec; entry: AwardRaceEntry }) {
  const unit = unitFor(spec);
  const hasBand = entry.bandLow != null && entry.bandHigh != null;

  if (spec.mode === "actuals") {
    const exp = entry.expectedValue;
    return (
      <span className="tnum flex shrink-0 items-baseline gap-1 whitespace-nowrap text-xs">
        <span className="font-semibold text-fg">
          {fmtMetric(entry.actual)}
          {unit ? <span className="text-muted">{unit}</span> : null}
        </span>
        {exp == null ? (
          <span className="text-[10px] text-muted">actuals only</span>
        ) : (
          <span className="text-[10px] text-muted">exp {fmtMetric(exp)}</span>
        )}
      </span>
    );
  }

  const value = spec.valueOf(entry);
  return (
    <span className="tnum flex shrink-0 items-baseline gap-1 whitespace-nowrap text-xs">
      <span className="font-semibold text-fg">{fmtRating(value)}</span>
      {hasBand ? (
        <span className="text-[10px] text-muted">
          ({fmtMetric(entry.bandLow)}&ndash;{fmtMetric(entry.bandHigh)})
        </span>
      ) : null}
    </span>
  );
}

/** One contender ROW (rank + flag + full name + figure), shared by the always-visible runners-up and
 *  the "Show more" overflow so both render identically. `rank` is the 1-based board rank (the leader is
 *  rank 1), shown verbatim so the overflow keeps counting from 4 with no gap. */
function ContenderRow({ spec, entry, rank }: { spec: AwardSpec; entry: AwardRaceEntry; rank: number }) {
  return (
    <li>
      <Link
        href={`/players/${entry.playerId}`}
        className="flex items-center gap-2 rounded-md py-0.5 transition hover:opacity-90"
      >
        <span className="tnum w-3 shrink-0 text-right text-[11px] font-semibold text-muted">
          {rank}
        </span>
        <Flag team={entry.nation} size="text-sm" link={false} />
        <span className="min-w-0 flex-1 truncate text-xs text-secondary">{entry.name}</span>
        <ContenderFigure spec={spec} entry={entry} />
      </Link>
    </li>
  );
}

/** The compact contender CLUSTER shared by all four award cards: the big leader (rank 1) keeps its own
 *  large row above; here ranks 2-3 stay ALWAYS VISIBLE directly below it (each on ONE tight line: flag +
 *  full name + figure), and ranks 4+ live COLLAPSED inside a native <details>/<summary> ("Show more").
 *  These are static server surfaces, so the disclosure is native <details> (no client state); the
 *  overflow body is present in SSR markup but hidden until expanded. Full names render at full width;
 *  only extreme outliers truncate (min-w-0 + truncate safety). The metric sublabel heads the figure
 *  column and is sized/placed never to wrap on phone. Renders nothing when no contenders remain. */
function ContenderCluster({ spec, entries }: { spec: AwardSpec; entries: AwardRaceEntry[] }) {
  if (entries.length === 0) return null;
  // `entries` is the board sliced from rank 2 (entries[0] is rank 2). Ranks 2-3 stay visible; 4+ fold.
  const visible = entries.slice(0, 2);
  const overflow = entries.slice(2);
  return (
    <div className="mt-3 border-t border-border pt-2">
      <div className="flex items-baseline justify-between gap-2 text-[10px] font-medium tracking-wide text-muted uppercase">
        <span className="truncate">Contenders</span>
        <span className="shrink-0 whitespace-nowrap">{spec.figureLabel}</span>
      </div>
      <ol className="mt-1.5 flex flex-col gap-1.5">
        {visible.map((e, i) => (
          <ContenderRow key={e.playerId} spec={spec} entry={e} rank={i + 2} />
        ))}
      </ol>
      {overflow.length > 0 ? (
        <details className="group mt-1.5">
          <summary className="flex cursor-pointer list-none items-center gap-1 text-[10px] font-medium tracking-wide text-muted uppercase whitespace-nowrap transition hover:text-secondary">
            <span>Show more</span>
            <span className="tnum text-muted/80">({overflow.length})</span>
          </summary>
          <ol className="mt-1.5 flex flex-col gap-1.5">
            {overflow.map((e, i) => (
              <ContenderRow key={e.playerId} spec={spec} entry={e} rank={i + 4} />
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

interface AwardSpec {
  key: keyof Pick<AwardRaces, "goldenBoot" | "playmaker" | "goldenGlove" | "potm">;
  title: string;
  /** Whether the card is ACTUALS-FIRST (Golden Boot, Playmaker -- headline is the real count) or a
   *  MODEL-PICK (Golden Glove, POTM -- headline is the model's expected value). */
  mode: Mode;
  /** The corner tag. Golden Boot / Playmaker are honest CURRENT leaderboards of who has actually
   *  scored / assisted, so they read "Current leaders"; Golden Glove + POTM remain the model's PICK,
   *  so they keep "Model pick". Never wraps (small font, no-wrap). */
  tag: string;
  /** Column sublabel above the contender figures (e.g. "Goals (range)"). Never wraps. */
  figureLabel: string;
  /** The expected value a MODEL-PICK card plots for the leader and each contender (composite score for
   *  POTM, expected clean sheets for the glove). Unused on actuals-first cards (they lead with `actual`). */
  valueOf: (e: AwardRaceEntry) => number | null;
  /** Honest copy when the board is empty. For the actuals-first boards this says nobody has scored /
   *  assisted yet, instead of a generic "not published". */
  emptyCopy: string;
  /** Model-pick boards (Golden Glove, POTM) carry a plain "the model's pick, no official award to
   *  compare against" note so they never read as a live race or imply a verdict. Absent on the actuals
   *  boards, which instead show a settled pick-vs-actual verdict. */
  subnote?: string;
}

/** One award card, uniform across all four races: title, the corner tag, the big rank-1 leader (flag +
 *  full name + the headline figure in a large font), then the compact contender cluster (ranks 2-3 as
 *  tight one-line rows always visible, ranks 4+ folded into a "Show more" <details>). The leader is the
 *  big figure only and is NOT repeated in the cluster (the cluster starts at rank 2). Golden Boot /
 *  Playmaker are ACTUALS-FIRST (the headline figure is the real
 *  goals / assists count, with the model's expected + band muted alongside; an unprojected scorer shows
 *  his count with a small "actuals only" marker, never a bare dash). Golden Glove + POTM stay MODEL-PICK
 *  (the headline figure is the model's expected value). When the board is empty the card shows the spec's
 *  honest empty copy. The per-board "why" explanation and the POTM caveat live on the methodology page. */
function AwardCard({
  spec,
  board,
  settled = false,
  verdict = null,
}: {
  spec: AwardSpec;
  board: AwardRaceEntry[];
  /** Tournament settled: the actuals boards show the final winner + a pick-vs-actual verdict, and the
   *  corner tag reads "Final" rather than the live-tense "Current leaders". */
  settled?: boolean;
  /** The settled pick-vs-actual verdict for an actuals board (null on model-pick boards or pre-settlement). */
  verdict?: AwardVerdict | null;
}) {
  const leader = board[0] ?? null;
  // The contenders below the big leader: ranks 2+. De-dupes the leader so it is never shown twice. The
  // cluster keeps ranks 2-3 visible and folds ranks 4+ into a "Show more" <details>.
  const contenders = board.slice(1);
  // Actuals boards read "Current leaders" while live; once settled they are the FINAL standings.
  const tag = spec.mode === "actuals" && settled ? "Final" : spec.tag;
  const showVerdict = spec.mode === "actuals" && settled && verdict != null;

  return (
    <div className="champion-surface flex flex-col rounded-card border p-3 sm:p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="truncate font-display text-sm font-semibold tracking-wide text-gold-strong uppercase">
          {spec.title}
        </h3>
        <span className="shrink-0 whitespace-nowrap text-[10px] font-medium tracking-wide text-muted uppercase">
          {tag}
        </span>
      </div>

      {/* MODEL-PICK boards: a plain "no official award" note so the card never reads as a live race or
          implies a verdict. ACTUALS boards (settled): a pick-vs-actual verdict - HIT when the model's
          pre-tournament favourite is also the actual winner, else it names who the model favoured. */}
      {spec.subnote ? (
        <p className="mt-1 text-[11px] leading-snug text-muted">{spec.subnote}</p>
      ) : null}
      {showVerdict ? (
        verdict!.hit ? (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] leading-snug">
            <Tag variant="gold" className="shrink-0 px-1.5 py-0 text-[10px]">Called it</Tag>
            <span className="text-secondary">the model&apos;s pre-tournament pick won it.</span>
          </p>
        ) : (
          <p className="mt-1 text-[11px] leading-snug text-muted">
            Model&apos;s pre-tournament pick:{" "}
            <span className="text-secondary">{verdict!.pick.name}</span> (the actual winner is below).
          </p>
        )
      ) : null}

      {!leader ? (
        <p className="mt-3 text-sm text-muted">{spec.emptyCopy}</p>
      ) : (
        <>
          <Link
            href={`/players/${leader.playerId}`}
            className="mt-3 flex items-center gap-3 rounded-md py-1 transition hover:opacity-90"
          >
            <Flag team={leader.nation} size="text-2xl" className="champion-flag-ring shrink-0" link={false} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-display text-base font-bold text-fg">{leader.name}</span>
              <span className="flex items-center gap-1.5 text-xs text-secondary">
                {leader.role ? <Tag variant="gold" className="shrink-0 px-1.5 py-0">{leader.role}</Tag> : null}
                <span className="truncate">{leader.nation}</span>
              </span>
            </span>
            <LeaderFigure spec={spec} entry={leader} />
          </Link>

          <ContenderCluster spec={spec} entries={contenders} />
        </>
      )}
    </div>
  );
}

/** The four award races at the top of /players: Golden Boot, Playmaker, Golden Glove, Player of the
 *  Tournament. Golden Boot + Playmaker are honest CURRENT leaderboards of who has ACTUALLY scored /
 *  assisted so far (ACTUALS-FIRST: the headline figure is the real count, with the model's expected
 *  shown alongside); Golden Glove + POTM remain the model's PICK (expected-first). Each board carries
 *  only its leaderboard, corner tag, units and ranges: the per-board "why" explanation and the POTM
 *  noisiest-board caveat live on the methodology page (see /methodology#awards), not crowding the cards. */
export function AwardCards({ races, settled = false }: { races: AwardRaces; settled?: boolean }) {
  const specs: AwardSpec[] = [
    {
      key: "goldenBoot",
      title: "Golden Boot",
      mode: "actuals",
      tag: "Current leaders",
      figureLabel: "Goals (exp)",
      // expectedValue IS the board's expected goals (the context the actuals-first figure shows as "exp").
      valueOf: (e) => e.expectedValue,
      emptyCopy: "No goals scored yet.",
    },
    {
      key: "playmaker",
      title: "Playmaker",
      mode: "actuals",
      tag: "Current leaders",
      figureLabel: "Assists (exp)",
      valueOf: (e) => e.expectedValue,
      emptyCopy: "No assists recorded yet.",
    },
    {
      // 1d: the board is RANKED by the model's shot-stopping composite (award_golden_glove =
      // expectedValue), but it used to DISPLAY expected_clean_sheets (headlineExpected) - a different
      // field. So a rank-1 keeper could show a SMALLER clean-sheet number than rank-2, reading as a broken
      // sort, and the "(range)" promised a band the composite never carries. Display the field the board
      // is actually ordered by, so the figure is monotonic with rank and the label is honest.
      key: "goldenGlove",
      title: "Golden Glove",
      mode: "expected",
      tag: "Model pick",
      figureLabel: "Shot-stopping index",
      valueOf: (e) => e.expectedValue,
      emptyCopy: "No leaderboard published yet.",
      subnote: "A shot-stopping PROXY, not the official Golden Glove - the model's pick, with no official award compared here.",
    },
    {
      key: "potm",
      title: "Player of the Tournament",
      mode: "expected",
      tag: "Model pick",
      figureLabel: "Composite score (range)",
      valueOf: (e) => e.expectedValue,
      emptyCopy: "No leaderboard published yet.",
      subnote: "The model's pick - there is no official award to compare against, so it is a talking point, not a verdict.",
    },
  ];

  // The actuals boards carry a settled pick-vs-actual verdict; the model-pick boards do not.
  const verdictOf = (key: AwardSpec["key"]): AwardVerdict | null =>
    key === "goldenBoot" ? races.goldenBootVerdict ?? null
      : key === "playmaker" ? races.playmakerVerdict ?? null
        : null;

  return (
    // Single-column at the phone base, stepping up to two-up at sm and four-up at xl.
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
      {specs.map((spec) => (
        <AwardCard key={spec.key} spec={spec} board={races[spec.key]} settled={settled} verdict={verdictOf(spec.key)} />
      ))}
    </div>
  );
}
