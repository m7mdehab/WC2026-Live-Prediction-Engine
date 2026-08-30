import { BracketCell } from "@/components/bracket/BracketCell";
import { BracketNote } from "@/components/bracket/BracketNote";
import { Flag } from "@/components/ui/Flag";
import type { BracketMatch, ProjectedBracket } from "@/lib/types";

/** Projected-champion winner's ribbon: a slim banner attached FLUSH to the TOP EDGE of the Final card so
 *  the two read as ONE unit (shared gold border, rounded top, no bottom border). A short "Projected
 *  champion" eyebrow sits over a single row of the champion flag (shared Flag in the gold ring) and the
 *  champion name (gold-strong). Gold-family tokens only (non-inverting); dark surface fill; the only text
 *  is the eyebrow + the name. Returns null when no champion is resolved yet, so the ribbon is fully ABSENT
 *  (never an empty/null ribbon) and the Final card simply centers alone. It lives INSIDE the Final card's
 *  centered group (below), so it is vertically centered with the card, never floating at the column top. */
function ChampionRibbon({ champion, settled = false }: { champion: string | null; settled?: boolean }) {
  if (!champion) return null;
  return (
    <div
      data-champion-ribbon
      data-champion-settled={settled ? "" : undefined}
      className="flex flex-col items-center gap-0.5 rounded-t-card border border-b-0 border-gold-line bg-surface px-2 py-1.5 text-center"
    >
      {/* SETTLED (the CURRENT/actual bracket, tournament over): the champion is a FACT, so the eyebrow
          reads "Champion", not "Projected champion". The pre-tournament bracket stays a projection. */}
      <span className="text-[9px] font-semibold tracking-wider text-gold-strong uppercase">
        {settled ? "Champion" : "Projected champion"}
      </span>
      <span className="flex items-center justify-center gap-1.5">
        <span className="champion-flag-ring rounded-[3px]">
          <Flag team={champion} size="text-base" link={false} />
        </span>
        <span className="font-display text-sm font-semibold text-gold-strong">{champion}</span>
      </span>
    </div>
  );
}

// Column layout derived from the real knockout_slots topology (the two "halves" are the SF1- and
// SF2-feeder subtrees, NOT M73–M80 / M81–M88 - see docs). Order is top→bottom so each later-round
// cell sits between its two feeders.
const LEFT = {
  r32: ["M074", "M077", "M073", "M075", "M083", "M084", "M081", "M082"],
  r16: ["M089", "M090", "M093", "M094"],
  qf: ["M097", "M098"],
  sf: ["M101"],
};
const RIGHT = {
  r32: ["M076", "M078", "M079", "M080", "M086", "M088", "M085", "M087"],
  r16: ["M091", "M092", "M095", "M096"],
  qf: ["M099", "M100"],
  sf: ["M102"],
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(iso));
}

function Column({
  ids,
  header,
  matches,
  champion,
  nationFill,
}: {
  ids: string[];
  header: string;
  matches: Record<string, BracketMatch>;
  champion: string | null;
  nationFill: boolean;
}) {
  return (
    // min-w-[168px] floor = the nation cell's own min-width, so the column never shrinks below its cell
    // (which would let the cell content overflow into the next column). flex-1 still grows it at wide
    // widths; when the bracket's total min-width exceeds the container, the outer overflow-x-auto scrolls.
    <div data-bracket-col className="flex min-w-[168px] flex-1 flex-col">
      <div className="mb-2 truncate text-center text-[10px] font-semibold tracking-wider text-muted uppercase">
        {header}
      </div>
      <div className="flex flex-1 flex-col justify-around gap-3">
        {ids.map((id) => (
          <BracketCell key={id} m={matches[id]} champion={champion} fill={nationFill ? "nation" : "bar"} />
        ))}
      </div>
    </div>
  );
}

export function DesktopBracket({
  bracket,
  nationFill = false,
  championSettled = false,
}: {
  bracket: ProjectedBracket;
  nationFill?: boolean;
  /** Tournament SETTLED and this is the CURRENT (actual) bracket: the ribbon eyebrow reads "Champion"
   *  (a fact), not "Projected champion". The pre-tournament bracket stays a projection when settled. */
  championSettled?: boolean;
}) {
  const { matches, champion } = bracket;
  const final = matches["M104"];
  const third = matches["M103"];

  return (
    <section>
      {/* heading + subtitle (the standalone projected-champion banner is gone; the champion now reads
          off the gold-ringed Final cell + the projected-champion's-path legend). */}
      <div className="mb-4">
        <h2 className="font-display text-2xl font-bold text-fg">Projected Bracket</h2>
        <p className="text-sm text-secondary">
          The model&apos;s single most-likely knockout path, R32 to Final.
        </p>
      </div>

      {/* the bracket: 9 fluid columns, two halves meeting at the Final. Columns are flex fractions
          so the bracket always fills its (capped) container - no internal scroll at desktop widths;
          overflow-x-auto is kept only as a last-resort safety. */}
      <div data-bracket-scroll className="overflow-x-auto pb-2">
        <div className="flex items-stretch gap-2">
          <Column ids={LEFT.r32} header="Round of 32" matches={matches} champion={champion} nationFill={nationFill} />
          <Column ids={LEFT.r16} header="Round of 16" matches={matches} champion={champion} nationFill={nationFill} />
          <Column ids={LEFT.qf} header="Quarter-finals" matches={matches} champion={champion} nationFill={nationFill} />
          <Column ids={LEFT.sf} header="Semi-finals" matches={matches} champion={champion} nationFill={nationFill} />

          {/* center: Final (+ venue/date) and third-place playoff - a touch wider than the rounds. The
              min-w-[192px] floor = the final cell's own min-width (180px) plus the gold-ringed wrapper's
              p-1 + border, so the wrapped Final card never overflows the column (the rounds need no wrapper
              allowance, hence their 168px floor). */}
          <div data-bracket-col className="flex min-w-[192px] flex-[1.35] flex-col">
            {/* small uppercase "Final" header at the column top, consistent with the other round headers */}
            <div className="mb-2 truncate text-center text-[10px] font-semibold tracking-wider text-gold-strong uppercase">
              Final
            </div>
            <div className="flex flex-1 flex-col justify-center gap-3">
              {/* the projected-champion ribbon + the Final card are ONE vertically-centered unit: the
                  ribbon is a banner flush on the card's top edge (shared gold border, no seam). When no
                  champion is resolved the ribbon is absent and the card simply centers alone (no gap). */}
              <div>
                <ChampionRibbon champion={champion} settled={championSettled} />
                <div
                  data-final-card
                  className={`border border-gold-line bg-surface p-1 shadow-[var(--shadow-card)] ${
                    champion ? "rounded-b-card border-t-0" : "rounded-card"
                  }`}
                >
                  <BracketCell m={final} champion={champion} variant="final" fill={nationFill ? "nation" : "bar"} />
                  {final ? (
                    <p className="tnum px-2 pt-1.5 pb-1 text-center text-[10px] text-muted">
                      {[final.venue, final.city].filter(Boolean).join(", ")}
                      {final.kickoff_utc ? ` · ${fmtDate(final.kickoff_utc)}` : ""}
                    </p>
                  ) : null}
                </div>
              </div>
              <div>
                <div className="mb-1 text-center text-[10px] font-medium tracking-wider text-muted uppercase">
                  Third place
                </div>
                <BracketCell m={third} champion={champion} fill={nationFill ? "nation" : "bar"} />
              </div>
            </div>
          </div>

          <Column ids={RIGHT.sf} header="Semi-finals" matches={matches} champion={champion} nationFill={nationFill} />
          <Column ids={RIGHT.qf} header="Quarter-finals" matches={matches} champion={champion} nationFill={nationFill} />
          <Column ids={RIGHT.r16} header="Round of 16" matches={matches} champion={champion} nationFill={nationFill} />
          <Column ids={RIGHT.r32} header="Round of 32" matches={matches} champion={champion} nationFill={nationFill} />
        </div>
      </div>

      {/* legend + caption (also a methodology talking point) */}
      <BracketNote />
    </section>
  );
}
