// dailyAuto.ts - pure derivations for the self-populating daily briefing.
//
// Deliberately dependency-free (no server-only, no path-alias imports, no DB): every briefing rule
// lives here as a pure function over plain inputs, so the recap/movers/watching/headline logic and
// the next-matchday rollover are unit-checkable in plain node (tsc-compiled) without a database.
// db reads + assembly live in daily.ts; rendering in components/daily/BriefingSections.tsx.

// ---------------------------------------------------------------------------------------------
// input shapes (structural subsets of daily.ts's DailyFixture - keep in sync by shape, not import)
// ---------------------------------------------------------------------------------------------

export interface AutoProbs {
  p_team_a_win: number | null;
  p_draw: number | null;
  p_team_b_win: number | null;
}

/** The slice of a day's fixture the briefing rules need. `probs` are the CURRENT run's odds;
 *  `result` is the recorded final score (team_a-team_b orientation); `finished` is true when a
 *  completed result exists (or the fixture is marked completed). */
export interface AutoFixture {
  match_id: string;
  team_a: string | null;
  team_b: string | null;
  kickoff_utc: string | null;
  probs: AutoProbs | null;
  result: { a: number; b: number } | null;
  finished: boolean;
}

export type Outcome = "a" | "draw" | "b";

export interface RecapRow {
  match_id: string;
  team_a: string;
  team_b: string;
  scoreA: number;
  scoreB: number;
  outcome: Outcome;
  /** W/D/L from the run that was current before the day's first kickoff; null if none recorded. */
  pre: { pa: number; pd: number; pb: number } | null;
  modal: Outcome | null;
  modalP: number | null;
  /** The pre-match probability of the outcome that actually happened. */
  outcomeP: number | null;
  /** true = the actual outcome was the model's modal outcome; null when no pre-match odds exist. */
  called: boolean | null;
}

/** Champion-odds delta (0..1 scale) between the pre-matchday run and the latest run. */
export interface Mover {
  team: string;
  before: number;
  after: number;
  delta: number;
}

export interface Watching {
  date: string;
  /** Competitiveness-ordered (smallest favourite margin first; no-odds fixtures last). */
  fixtures: AutoFixture[];
  /** The fixture with the highest probability that the favourite loses outright. */
  upset: { match_id: string; favorite: string; underdog: string; p: number } | null;
}

export interface BriefingAuto {
  headline: string | null;
  /** One row per finished fixture with a recorded score that day. Empty = nothing finished yet. */
  recap: RecapRow[];
  /** null = no post-matchday run exists yet (graceful "updates after the next model run"). */
  movers: { risers: Mover[]; fallers: Mover[] } | null;
  /** The next matchday after this date, from the current run. null when none remains. */
  watching: Watching | null;
}

export function emptyAuto(): BriefingAuto {
  return { headline: null, recap: [], movers: null, watching: null };
}

// ---------------------------------------------------------------------------------------------
// next-matchday rollover
// ---------------------------------------------------------------------------------------------

/** The rollover rule: next matchday = the EARLIEST date that has at least one fixture without a
 *  recorded result. Not clock-based. A day whose every match is finished is complete; once the
 *  whole schedule is finished, fall back to the last matchday (allComplete = true). */
export function nextMatchday(
  days: { date: string; matchCount: number; finishedCount: number }[]
): { next: string | null; allComplete: boolean } {
  const matchdays = days.filter((d) => d.matchCount > 0);
  const open = matchdays.find((d) => d.finishedCount < d.matchCount);
  if (open) return { next: open.date, allComplete: false };
  return { next: matchdays.at(-1)?.date ?? null, allComplete: matchdays.length > 0 };
}

// ---------------------------------------------------------------------------------------------
// recap
// ---------------------------------------------------------------------------------------------

export function outcomeOf(a: number, b: number): Outcome {
  return a > b ? "a" : b > a ? "b" : "draw";
}

function modalOutcome(pa: number, pd: number, pb: number): { o: Outcome; p: number } {
  if (pa >= pd && pa >= pb) return { o: "a", p: pa };
  if (pb >= pd && pb >= pa) return { o: "b", p: pb };
  return { o: "draw", p: pd };
}

/** Build recap rows for a day's fixtures: finished, score recorded, both teams known. `pre` maps
 *  match_id -> the pre-matchday run's W/D/L for it. Rows keep the day's kickoff order. */
export function buildRecap(
  dayFixtures: AutoFixture[],
  pre: Map<string, AutoProbs>
): RecapRow[] {
  const rows: RecapRow[] = [];
  for (const f of dayFixtures) {
    if (!f.finished || !f.result || !f.team_a || !f.team_b) continue;
    const outcome = outcomeOf(f.result.a, f.result.b);
    const p = pre.get(f.match_id);
    const has = p && p.p_team_a_win != null && p.p_draw != null && p.p_team_b_win != null;
    const modal = has ? modalOutcome(p.p_team_a_win!, p.p_draw!, p.p_team_b_win!) : null;
    const outcomeP = has
      ? outcome === "a" ? p.p_team_a_win! : outcome === "b" ? p.p_team_b_win! : p.p_draw!
      : null;
    rows.push({
      match_id: f.match_id, team_a: f.team_a, team_b: f.team_b,
      scoreA: f.result.a, scoreB: f.result.b, outcome,
      pre: has ? { pa: p.p_team_a_win!, pd: p.p_draw!, pb: p.p_team_b_win! } : null,
      modal: modal?.o ?? null, modalP: modal?.p ?? null,
      outcomeP, called: modal ? modal.o === outcome : null,
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------------------------
// movers
// ---------------------------------------------------------------------------------------------

/** Top-3 risers and fallers by champion-probability delta between two runs. Teams missing from
 *  either run, or with a negligible move (< 0.05pp), are skipped. */
export function buildMovers(
  before: Map<string, number | null>,
  after: Map<string, number | null>
): { risers: Mover[]; fallers: Mover[] } {
  const moves: Mover[] = [];
  for (const [team, b] of before) {
    const a = after.get(team);
    if (b == null || a == null) continue;
    const delta = a - b;
    if (Math.abs(delta) < 0.0005) continue;
    moves.push({ team, before: b, after: a, delta });
  }
  moves.sort((x, y) => y.delta - x.delta);
  return {
    risers: moves.filter((m) => m.delta > 0).slice(0, 3),
    fallers: moves.filter((m) => m.delta < 0).reverse().slice(0, 3),
  };
}

// ---------------------------------------------------------------------------------------------
// watching
// ---------------------------------------------------------------------------------------------

function hasProbs(f: AutoFixture): boolean {
  return f.probs?.p_team_a_win != null && f.probs?.p_draw != null && f.probs?.p_team_b_win != null;
}

/** Favourite margin |pa - pb|; fixtures without odds sort last (by kickoff). */
export function orderByCompetitiveness(fixtures: AutoFixture[]): AutoFixture[] {
  return fixtures.slice().sort((x, y) => {
    const hx = hasProbs(x), hy = hasProbs(y);
    if (hx !== hy) return hx ? -1 : 1;
    if (!hx) return (x.kickoff_utc ?? "").localeCompare(y.kickoff_utc ?? "");
    const mx = Math.abs(x.probs!.p_team_a_win! - x.probs!.p_team_b_win!);
    const my = Math.abs(y.probs!.p_team_a_win! - y.probs!.p_team_b_win!);
    return mx - my;
  });
}

/** The biggest potential upset: the fixture with the highest probability that the favourite loses
 *  outright (the underdog's win probability). */
export function findUpset(fixtures: AutoFixture[]): Watching["upset"] {
  let best: Watching["upset"] = null;
  for (const f of fixtures) {
    if (!hasProbs(f) || !f.team_a || !f.team_b) continue;
    const pa = f.probs!.p_team_a_win!, pb = f.probs!.p_team_b_win!;
    if (pa === pb) continue; // no favourite, no upset
    const aFav = pa > pb;
    const p = aFav ? pb : pa;
    if (!best || p > best.p) {
      best = {
        match_id: f.match_id,
        favorite: aFav ? f.team_a : f.team_b,
        underdog: aFav ? f.team_b : f.team_a,
        p,
      };
    }
  }
  return best;
}

export function buildWatching(date: string, fixtures: AutoFixture[]): Watching | null {
  if (fixtures.length === 0) return null;
  const ordered = orderByCompetitiveness(fixtures);
  return { date, fixtures: ordered, upset: findUpset(ordered) };
}

// ---------------------------------------------------------------------------------------------
// headline (rule-based one-liner, no em-dashes, jargon-free)
// ---------------------------------------------------------------------------------------------

const fmt = (p: number) => `${(p * 100).toFixed(0)}%`;

/** Marquee fixture for a preview: the matchup whose two teams carry the highest combined champion
 *  odds (falls back to the day's first kickoff when champion odds are unavailable). */
export function marqueeFixture(
  fixtures: AutoFixture[],
  champ: Map<string, number | null> | null
): AutoFixture | null {
  const named = fixtures.filter((f) => f.team_a && f.team_b);
  if (named.length === 0) return null;
  if (!champ) return named[0];
  let best = named[0], bestScore = -1;
  for (const f of named) {
    const s = (champ.get(f.team_a!) ?? 0) + (champ.get(f.team_b!) ?? 0);
    if (s > bestScore) { best = f; bestScore = s; }
  }
  return best;
}

/** Priority: completed-day story when results exist; else the day's marquee fixture; else (rest
 *  day) the next matchday's marquee. Returns null only when there is nothing to say. */
export function buildHeadline(args: {
  recap: RecapRow[];
  dayFixtures: AutoFixture[];
  champ: Map<string, number | null> | null;
  watching: Watching | null;
  watchingLabel: string | null; // human label of the watching date, e.g. "Friday, 12 June"
}): string | null {
  const { recap, dayFixtures, champ, watching, watchingLabel } = args;

  if (recap.length > 0) {
    // The day's story: the biggest miss if the model got one wrong, else the first result.
    const missed = recap
      .filter((r) => r.called === false && r.outcomeP != null)
      .sort((x, y) => x.outcomeP! - y.outcomeP!);
    const r = missed[0] ?? recap[0];
    if (r.outcome === "draw") {
      const odds = r.outcomeP != null ? ` The model gave the draw ${fmt(r.outcomeP)}.` : "";
      return `${r.team_a} and ${r.team_b} drew ${r.scoreA}-${r.scoreB}.${odds}`;
    }
    const winner = r.outcome === "a" ? r.team_a : r.team_b;
    const loser = r.outcome === "a" ? r.team_b : r.team_a;
    const hi = Math.max(r.scoreA, r.scoreB), lo = Math.min(r.scoreA, r.scoreB);
    if (missed[0]) {
      return `Upset: ${winner} beat ${loser} ${hi}-${lo}. The model had ${winner} at just ${fmt(r.outcomeP!)}.`;
    }
    const odds = r.outcomeP != null ? `, a win the model had at ${fmt(r.outcomeP)}` : "";
    return `${winner} beat ${loser} ${hi}-${lo}${odds}.`;
  }

  if (dayFixtures.length > 0) {
    const m = marqueeFixture(dayFixtures, champ);
    if (!m) {
      const n = dayFixtures.length;
      return `${n} ${n === 1 ? "match" : "matches"} scheduled. Matchups firm up as the bracket resolves.`;
    }
    if (hasProbs(m)) {
      const pa = m.probs!.p_team_a_win!, pd = m.probs!.p_draw!, pb = m.probs!.p_team_b_win!;
      if (Math.abs(pa - pb) < 0.05) {
        return `Eyes on ${m.team_a} vs ${m.team_b}. The model calls it close: ${fmt(pa)} / ${fmt(pd)} / ${fmt(pb)}.`;
      }
      const fav = pa > pb ? m.team_a! : m.team_b!;
      return `Eyes on ${m.team_a} vs ${m.team_b}. The model has ${fav} at ${fmt(Math.max(pa, pb))} to win.`;
    }
    return `Eyes on ${m.team_a} vs ${m.team_b}.`;
  }

  if (watching && watchingLabel) {
    const m = marqueeFixture(watching.fixtures, champ);
    if (m) return `Rest day. Next up: ${m.team_a ?? "TBC"} vs ${m.team_b ?? "TBC"} on ${watchingLabel}.`;
    return `Rest day. The next matchday is ${watchingLabel}.`;
  }

  return null;
}
