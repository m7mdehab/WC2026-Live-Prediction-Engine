import type { ModelPredictionRun } from "@/lib/types";

/**
 * A visible staleness banner for /forecast. Renders ONLY when the served board is proven behind the
 * latest published run (a run_id mismatch, see lib/data/forecastFreshness). A forecast that
 * confidently names the wrong champion is the worst failure this product can have, so a served-stale
 * state must never be silent.
 *
 * Deliberately not wall-clock age: a finished tournament's last run is legitimately days old yet
 * CURRENT, so age would false-alarm. Only a run_id divergence from live triggers this. Zero-CLS: a
 * single block that occupies no space at all when fresh (returns null).
 */
export function ForecastFreshnessNote({
  stale,
  run,
}: {
  stale: boolean;
  run: ModelPredictionRun | null;
}) {
  if (!stale) return null;
  const condN =
    run && run.conditioned_on_results > 0
      ? `conditioned on ${run.conditioned_on_results} results`
      : "an earlier run";
  return (
    <div
      role="status"
      className="mb-4 rounded-lg border border-upset bg-upset-bg px-3 py-2 text-sm text-upset"
    >
      This board may be delayed: it is showing an older run ({condN}). A newer run has published;
      reload in a moment to see the current forecast.
    </div>
  );
}
