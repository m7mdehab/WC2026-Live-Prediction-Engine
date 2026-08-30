// Generates the "why favored" line for a match and the champion hero, STRICTLY from the
// 4B.1 factor data + the model's match probabilities. INTEGRITY RULE: every clause traces
// to a real factor / data fact. No driver is invented; recent-form claims are the actual
// last-N results. When a factor doesn't apply (or works against the favorite) it is simply
// omitted - never fabricated.

import type {
  ChampionContext, FormMatch, MatchProbabilities, UpcomingMatch,
} from "@/lib/types";
import { simPct } from "@/lib/utils";

export type WhyConfidence = "high" | "medium" | "slim" | "coinflip";

export interface WhyFavored {
  /** The favored team, or null for a near-even match. */
  favored: string | null;
  confidence: WhyConfidence;
  /** Each clause already traces to factor data; rendered joined into a sentence. */
  clauses: string[];
  sentence: string;
}

const BAND_PHRASE: Record<string, string> = {
  large: "a decisive rating edge",
  moderate: "a clear rating edge",
  slight: "a slight rating edge",
  negligible: "near-level on rating",
};

/** Tally an actual last-N record. Pure count of the stored results - no interpretation. */
export function formRecord(form: FormMatch[]): { w: number; d: number; l: number; n: number } {
  let w = 0, d = 0, l = 0;
  for (const m of form) {
    if (m.result === "W") w++;
    else if (m.result === "D") d++;
    else if (m.result === "L") l++;
  }
  return { w, d, l, n: form.length };
}

/** A short, literal recent-form fact for a side (or null if no form on record). */
export function formFact(form: FormMatch[]): string | null {
  const { w, d, l, n } = formRecord(form);
  if (n === 0) return null;
  const notable = form.some((m) => m.notable);
  if (l === 0) {
    const base = `unbeaten in their last ${n}`;
    return notable ? `${base}, with a win over a top-10 side` : base;
  }
  const base = `${w}W-${d}D-${l}L in their last ${n}`;
  return notable ? `${base}, incl. a win over a top-10 side` : base;
}

function favoredFromProbs(p: MatchProbabilities | null): {
  side: "a" | "b" | null;
  winnerProb: number;
  margin: number;
} {
  const pa = p?.p_team_a_win ?? 0;
  const pb = p?.p_team_b_win ?? 0;
  const margin = Math.abs(pa - pb);
  if (margin < 0.05) return { side: null, winnerProb: Math.max(pa, pb), margin };
  return { side: pa > pb ? "a" : "b", winnerProb: Math.max(pa, pb), margin };
}

function rankClause(rank: number | null): string | null {
  return rank != null ? `ranked #${rank}` : null;
}

/** Build the why-favored explanation for one upcoming match. */
export function whyFavored(m: UpcomingMatch): WhyFavored {
  const f = m.factors;
  const { side, winnerProb } = favoredFromProbs(m.probs);

  // Near-even match: state it honestly with the model's split; no manufactured favorite.
  if (!side || !f) {
    const clauses: string[] = [];
    if (f) {
      const band = f.rating_gap.band;
      if (band) clauses.push(BAND_PHRASE[band]);
      const rk = `${m.team_a} #${f.fifa_rank.team_a ?? "—"} vs ${m.team_b} #${f.fifa_rank.team_b ?? "—"}`;
      clauses.push(`FIFA ${rk}`);
    }
    if (m.probs) {
      clauses.push(
        `model split ${simPct(m.probs.p_team_a_win)} / draw ${simPct(m.probs.p_draw)} / ${simPct(m.probs.p_team_b_win)}`
      );
    }
    return {
      favored: null,
      confidence: "coinflip",
      clauses,
      sentence: `Too close to call: ${clauses.join("; ")}.`,
    };
  }

  const favored = side === "a" ? m.team_a : m.team_b;
  const opponent = side === "a" ? m.team_b : m.team_a;
  const favRank = side === "a" ? f.fifa_rank.team_a : f.fifa_rank.team_b;
  const clauses: string[] = [];

  // 1) rank (the favored team is named at the start of the sentence, so this is unambiguous)
  const rc = rankClause(favRank);
  if (rc) clauses.push(rc);

  // 2) rating gap - only when it actually favors this side; name the opponent + signed Elo.
  //    (Recent form is intentionally NOT in the sentence - it's shown as result chips below.)
  const rg = f.rating_gap;
  if (rg.band && rg.diff != null && rg.favored === favored) {
    const mag = Math.round(Math.abs(rg.diff));
    clauses.push(
      rg.band === "negligible"
        ? `near-level with ${opponent} on rating`
        : `${BAND_PHRASE[rg.band]} over ${opponent} (+${mag} Elo)`
    );
  } else if (rg.band === "negligible") {
    clauses.push(`near-level with ${opponent} on rating`);
  }

  // 3) host - only when it supports the favored side (host nation in its own country)
  if (f.host_effect.applies && f.host_effect.team === favored) {
    clauses.push("playing at home as hosts");
  }

  // 4) altitude - only when the OPPONENT is the disadvantaged side (supports the favorite);
  //    name the disadvantaged team explicitly, never bare "the opponent".
  if (f.altitude.applies && f.altitude.disadvantaged_team === opponent) {
    const city = m.city ? ` in ${m.city}` : "";
    clauses.push(`${opponent} gives up ~${f.altitude.burden_km.toFixed(1)} km of altitude${city}`);
  }

  const confidence: WhyConfidence =
    winnerProb >= 0.6 ? "high" : winnerProb >= 0.45 ? "medium" : "slim";

  const sentence = `${favored} favored: ${clauses.join("; ")}.`;
  return { favored, confidence, clauses, sentence };
}

/** The champion hero's grounded one-line "why", from rating + recent form only. */
export function championWhy(c: ChampionContext): string {
  const parts: string[] = [];
  if (c.fifaRank != null) parts.push(`World No. ${c.fifaRank}`);
  if (c.elo != null) parts.push(`the model's top-rated side at ${Math.round(c.elo)} Elo`);
  const lead = parts.length ? parts.join(", ") : "The model's title pick";
  const ff = formFact(c.form);
  return ff ? `${lead}: ${ff}.` : `${lead}.`;
}
