import { Tag } from "@/components/ui/Tag";
import { ModelBenchmark } from "@/components/humans/ModelBenchmark";
import { CrowdInsights } from "@/components/humans/CrowdInsights";
import { Leaderboard } from "@/components/humans/Leaderboard";
import { ScoringRubric } from "@/components/humans/ScoringRubric";
import { ScrollCta } from "@/components/predict/ScrollCta";
import type { ComparisonData } from "@/lib/types/humans";

/** "8 Jun 2026" from the run timestamp (UTC, deterministic - mirrors the forecast/home pages). */
function formatUpdated(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  }).format(new Date(iso));
}

/** The AI-vs-Humans comparison (a section of /predict since the IA consolidation; anchored at
 *  /predict#ai-vs-humans): model-vs-humans bracket comparison, crowd insights, and a transparent
 *  round-weighted leaderboard. Pure presentation - every number comes from the view-model. */
export function HumansView({
  data,
  pickerAnchor,
}: {
  data: ComparisonData;
  /** In-page anchor of the bracket picker above this section (e.g. "#picker"). */
  pickerAnchor?: string;
}) {
  const { mode, lowN, threshold, demo, model, frozenModel, entries, crowd, rubric, decided, provisional } = data;

  // No model bracket at all → can't benchmark anything.
  if (!model) {
    return (
      <section className="mx-auto max-w-3xl">
        <h2 className="font-display text-2xl font-bold text-fg">AI vs Humans</h2>
        <p className="mt-2 max-w-prose text-sm text-secondary">
          The model&apos;s projected bracket isn&apos;t published yet, so there&apos;s nothing to
          compare submitted brackets against. Check back once the forecast is live.
        </p>
      </section>
    );
  }

  return (
    <section>
      <header className="mb-5">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <h2 className="font-display text-2xl font-bold text-fg">AI vs Humans</h2>
          {demo ? <Tag variant="upset">Sample data</Tag> : null}
          {mode === "results" ? (
            <>
              <Tag variant="confident">Scoring vs results{decided != null ? ` · ${decided}/31 decided` : ""}</Tag>
              {provisional ? (
                <Tag variant="neutral">provisional · locks in as results arrive</Tag>
              ) : null}
            </>
          ) : (
            <Tag variant="neutral">Pre-tournament · all rounds pending</Tag>
          )}
        </div>
        <p className="max-w-prose text-sm text-secondary">
          How the brackets people submitted on <span className="font-medium text-fg">/predict</span> stack
          up, with the model ranked as one more competitor. {mode === "results"
            ? "Every bracket is scored ONLY against actual results: rounds already decided carry points, rounds not yet decided are pending and lock in round by round as results arrive."
            : "Before kickoff nothing is decided, so every round is pending and the leaderboard locks in as actual results arrive. Brackets are scored only against actual results, never against the model."}
        </p>
        {model.run ? (
          <p className="tnum mt-2 text-xs text-muted">
            Model competitor: the {model.run.model_version} model ({model.run.iterations.toLocaleString()} sims)
            committed its PRE-TOURNAMENT bracket once, before kickoff like every human, scored only against
            actual results.{model.run.conditioned_on_results > 0
              ? ` Its current read (conditioned on ${model.run.conditioned_on_results} results, updated ${formatUpdated(model.run.created_at)}) feeds the "Crowd vs the model" comparison only, not its score.`
              : ""}
          </p>
        ) : null}
        {pickerAnchor ? (
          <div className="mt-4">
            <ScrollCta
              target={pickerAnchor}
              className="inline-flex items-center gap-2 rounded-full bg-gold px-6 py-3 text-sm font-semibold text-on-gold shadow-[var(--shadow-card)] transition-colors hover:bg-gold-strong"
            >
              Make your own bracket
              <span aria-hidden>↓</span>
            </ScrollCta>
          </div>
        ) : null}
      </header>

      {lowN ? (
        // Low-N fallback: don't show thin crowd stats - lead with the model bracket as the benchmark.
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <div className="rounded-card border border-dashed border-border-strong bg-bg-subtle p-4">
              <div className="flex items-center gap-2">
                <Tag variant="neutral">Not enough brackets yet</Tag>
                <span className="tnum text-xs text-muted">{entries.length} / {threshold} needed</span>
              </div>
              <p className="mt-2 max-w-prose text-sm text-secondary">
                Crowd insights unlock at {threshold} submitted brackets. Until then, here&apos;s the
                model&apos;s PRE-TOURNAMENT bracket, the one it competes with (locked before kickoff,
                scored only against actual results). Submit yours on{" "}
                <span className="font-medium text-fg">/predict</span> to see how it compares.
              </p>
            </div>
          </div>
          {/* The SCORED competitor card = the frozen pre-tournament bracket. Pass `frozenModel`
              directly (NOT `?? model`): when no cond0 bracket exists this is null and ModelBenchmark
              shows the visible "unavailable" state, never the live (foresight) bracket. */}
          <ModelBenchmark model={frozenModel ?? null} mode={mode} />
          {entries.length > 0 ? (
            <Leaderboard entries={entries} mode={mode} title="Early entries" />
          ) : (
            <ScoringRubric rubric={rubric} mode={mode} />
          )}
          {entries.length > 0 ? (
            <div className="lg:col-span-2"><ScoringRubric rubric={rubric} mode={mode} /></div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-4">
          {crowd ? <CrowdInsights crowd={crowd} model={model} mode={mode} /> : null}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Leaderboard entries={entries} mode={mode} />
            <div className="space-y-4">
              {/* The "pre-tournament bracket" competitor card is ALWAYS the frozen cond0 bracket, never
                  the live (cond72) projection - identical to the low-N branch above. CrowdInsights (the
                  live "crowd vs the model" comparison) keeps the live `model`. When no cond0 bracket
                  exists this is null and ModelBenchmark shows its "unavailable" state. */}
              <ModelBenchmark model={frozenModel ?? null} mode={mode} />
              <ScoringRubric rubric={rubric} mode={mode} />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
