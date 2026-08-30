// Pure stage-name formatter, shared by server pages AND client components (the consolidated
// /matches index renders DailyMatchRow client-side, so this must NOT live in the server-only
// data layer; lib/data/daily.ts re-exports it for its existing importers).
import type { Stage } from "@/lib/types";

/** Readable stage name for headings/tags, e.g. "Round of 32". */
export function stageLabel(stage: Stage): string {
  switch (stage) {
    case "group": return "Group stage";
    case "round_of_32": return "Round of 32";
    case "round_of_16": return "Round of 16";
    case "quarter_finals": return "Quarter-finals";
    case "semi_finals": return "Semi-finals";
    case "third_place_playoff": return "Third-place play-off";
    case "final": return "Final";
  }
}
