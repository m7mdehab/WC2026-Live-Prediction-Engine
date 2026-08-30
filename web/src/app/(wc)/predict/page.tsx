import type { Metadata } from "next";
import { getPredictOptions } from "@/lib/data/brackets";
import { getComparisonData } from "@/lib/data/humans";
import { isSeasonFrozen } from "@/lib/data/freeze";
import { PredictForm } from "@/components/predict/PredictForm";
import { HumansView } from "@/components/humans/HumansView";
import type { PredictOptions } from "@/lib/types/brackets";
import type { ComparisonData } from "@/lib/types/humans";

export const metadata: Metadata = {
  title: "Predict",
  description:
    "Pick your World Cup 2026 bracket and see how it stacks up against the AI model and everyone else: crowd insights, a round-weighted leaderboard, and the model benchmark.",
  alternates: { canonical: "/predict" },
};

// ISR (Track C static seal). Once the season is FROZEN the bracket challenge is CLOSED (the /api/predict
// freeze guard rejects new entries and the crowd read is served from the bounded Data Cache), so the whole
// page is immutable and prerenders as static. While LIVE the crowd read is per-request and the picker is
// interactive, so the route reverts to dynamic automatically. Gated on the isFrozen DATA predicate, never
// a date; RESULT_SURFACES revalidatePath keeps a live season fresh.
export const revalidate = 3600;

export default async function PredictPage() {
  // The picker options, the comparison, and the freeze verdict are independent reads - load in parallel;
  // each degrades on its own (a comparison outage never blocks the picker; a freeze-probe blip degrades
  // to the OPEN picker, matching the /api/predict fail-soft direction).
  const [optionsRes, comparisonRes, frozenRes] = await Promise.allSettled([
    getPredictOptions(),
    getComparisonData(),
    isSeasonFrozen(),
  ]);
  const frozen = frozenRes.status === "fulfilled" ? frozenRes.value : false;
  const options: PredictOptions | null =
    optionsRes.status === "fulfilled" ? optionsRes.value : null;
  if (optionsRes.status === "rejected") {
    console.error("Failed to load predict options:", optionsRes.reason);
  }
  let comparison: ComparisonData;
  if (comparisonRes.status === "fulfilled") {
    comparison = comparisonRes.value;
  } else {
    console.error("Failed to load AI-vs-humans comparison:", comparisonRes.reason);
    // Fail soft to the "no benchmark" state rather than a 500.
    comparison = {
      mode: "projection", lowN: true, threshold: 5, demo: false,
      model: null, entries: [], crowd: null, rubric: [], decided: null,
    };
  }

  return (
    <>
      {/* ---- AI vs Humans FIRST (absorbed /ai-vs-humans; deep-linked as /predict#ai-vs-humans, so
              the 301 from the old URL lands here at the top). Its prominent CTA scrolls down to the
              picker. Renders an h2 - the single page h1 lives in the picker below. ---- */}
      <section id="ai-vs-humans" aria-label="AI vs Humans" className="scroll-mt-20">
        <HumansView data={comparison} pickerAnchor="#picker" />
      </section>

      {/* ---- The bracket picker SECOND (carries the page h1). Once the season is frozen the challenge is
              CLOSED (the /api/predict freeze guard rejects submissions), so we render a closed state rather
              than an interactive picker that could only ever fail on submit. Reverts to the live picker
              automatically for a future season (frozen is the isFrozen DATA predicate, never a date). ---- */}
      <section id="picker" aria-label="Bracket picker" className="mt-12 scroll-mt-20">
        {frozen ? (
          <div className="mx-auto max-w-2xl rounded-card border border-border bg-surface p-6">
            <h1 className="font-display text-2xl font-bold text-fg">The bracket challenge is closed</h1>
            <p className="mt-2 text-sm text-secondary">
              The tournament has finished, so new entries can no longer be submitted. See how every
              bracket - including the model&apos;s - finished up on the{" "}
              <a href="#ai-vs-humans" className="font-medium text-confident hover:underline">
                AI vs Humans leaderboard
              </a>{" "}
              above.
            </p>
          </div>
        ) : !options || options.groups.length === 0 ? (
          <div className="mx-auto max-w-2xl">
            <h1 className="font-display text-2xl font-bold text-fg">Predict your bracket</h1>
            <p className="mt-2 text-sm text-secondary">
              The picker is temporarily unavailable; team data couldn&apos;t be loaded. Please try
              again shortly.
            </p>
          </div>
        ) : (
          <PredictForm options={options} comparisonAnchor="#ai-vs-humans" />
        )}
      </section>
    </>
  );
}
