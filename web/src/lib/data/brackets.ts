// brackets data layer - owned by the predict track. Server-only reads for the /predict human
// bracket picker. Convention (Wave 0): the shared lib/data.ts + lib/types.ts are edited only by
// live-ops; each track adds new reads in its own module to avoid shared-file collisions. Pure,
// client-safe logic (topology + §2.4 seeding) lives in lib/types/brackets.ts.
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { publicClient } from "@/lib/supabase/public";
import { cachedRead, TAGS } from "@/lib/data/cache";
import { R32_MATCHES } from "@/lib/types/brackets";
import type {
  GroupMembership,
  PredictGroup,
  PredictOptions,
  SeedingInputs,
} from "@/lib/types/brackets";

type TeamRow = { name: string; group_code: string; host_flag: boolean };

/** The 12 groups (A…L) with their four teams, the current run, and the R32 seeding inputs for the
 *  knockout picker. The run + seeding are optional - a missing/erroring projection must not crash
 *  the page; it degrades to null and the page shows the picker as unavailable. */
export function getPredictOptions(): Promise<PredictOptions> {
  return cachedRead("predict-options", [TAGS.predict, TAGS.run], _getPredictOptionsUncached);
}

async function _getPredictOptionsUncached(): Promise<PredictOptions> {
  const sb = publicClient();
  const [tm, runs] = await Promise.all([
    // scaling-guard-ok: teams is bounded by the tournament (48 rows, the qualified field)
    sb.from("teams").select("name, group_code, host_flag").order("group_code").order("name"),
    sb.from("current_run").select("run_id, model_version").limit(1),
  ]);
  if (tm.error) throw tm.error;

  const byGroup = new Map<string, PredictGroup>();
  for (const t of (tm.data ?? []) as TeamRow[]) {
    if (!byGroup.has(t.group_code)) byGroup.set(t.group_code, { group_code: t.group_code, teams: [] });
    byGroup.get(t.group_code)!.teams.push({ name: t.name, hostFlag: t.host_flag });
  }
  const groups = [...byGroup.values()].sort((a, b) => a.group_code.localeCompare(b.group_code));

  const run = runs.error ? undefined : (runs.data?.[0] as { run_id: string; model_version: string } | undefined);
  const runId = run?.run_id ?? null;

  // Seeding inputs are best-effort: if the projection is incomplete, the picker disables itself.
  let seeding: SeedingInputs | null = null;
  if (runId) {
    try {
      seeding = await getSeedingInputs(runId);
    } catch (err) {
      console.error("predict: seeding inputs load failed:", err);
    }
  }

  return {
    groups,
    runId,
    runModelVersion: run?.model_version ?? null,
    seeding,
  };
}

type StandingRow = { group_code: string; team: string; proj_rank: number };
type R32Row = { match_id: string; slot_a: string | null; slot_b: string | null; team_a: string | null; team_b: string | null };

/**
 * The deterministic §2.4 seeding inputs for `runId`:
 *  - groupOrder: each group's four teams in the model's projected finishing order (proj_rank 1→4),
 *    from group_standings_projection.
 *  - best3SlotToGroup: each best3 slot code → the group whose third the model assigned to it,
 *    inherited from the run's projected_bracket (the Annex C assignment). We read the model's R32
 *    occupant on the best3 side and map it to its group - robust to the DB's slot-text convention.
 *
 * Returns null if the projection is incomplete (any group missing four ranked teams, or fewer than
 * 8 best3 slots resolved) - the picker then disables itself rather than seed a broken field.
 */
export async function getSeedingInputs(runId: string): Promise<SeedingInputs | null> {
  // Cookie-free client: getSeedingInputs is called inside the cached getPredictOptions (must be
  // cache-safe) and by the /api/predict POST validator (anon read either way, RLS-equivalent).
  const sb = publicClient();
  const [gp, pb, tm] = await Promise.all([
    sb.from("group_standings_projection").select("group_code, team, proj_rank").eq("run_id", runId),
    sb
      .from("projected_bracket")
      .select("match_id, slot_a, slot_b, team_a, team_b")
      .eq("run_id", runId)
      .eq("stage", "round_of_32"),
    // scaling-guard-ok: teams is bounded by the tournament (48 rows, the qualified field)
    sb.from("teams").select("name, group_code"),
  ]);
  if (gp.error) throw gp.error;
  if (pb.error) throw pb.error;
  if (tm.error) throw tm.error;

  // team -> group, for mapping a best3 occupant back to its group.
  const groupOfTeam = new Map<string, string>();
  for (const t of (tm.data ?? []) as Pick<TeamRow, "name" | "group_code">[]) {
    groupOfTeam.set(t.name, t.group_code);
  }

  // group -> teams ordered by proj_rank (1→4).
  const groupOrder: Record<string, string[]> = {};
  const ranked: Record<string, { team: string; rank: number }[]> = {};
  for (const r of (gp.data ?? []) as StandingRow[]) {
    (ranked[r.group_code] ??= []).push({ team: r.team, rank: r.proj_rank });
  }
  for (const g of Object.keys(ranked)) {
    const ordered = ranked[g].slice().sort((a, b) => a.rank - b.rank);
    if (ordered.length !== 4) return null; // incomplete projection
    groupOrder[g] = ordered.map((x) => x.team);
  }
  if (Object.keys(groupOrder).length !== 12) return null;

  // best3 slot code -> group. The contract slot code comes from our canonical topology
  // (knockout_slots); the group comes from the model's occupant team on that side. The DB stores
  // zero-padded ids (M073); normalize to the un-padded form (M73) we key by.
  const pbByMatch = new Map(
    ((pb.data ?? []) as R32Row[]).map((r) => [r.match_id.replace(/^M0*/, "M"), r])
  );

  const best3SlotToGroup: Record<string, string> = {};
  for (const m of R32_MATCHES) {
    const row = pbByMatch.get(m.id);
    if (!row) continue;
    // Identify which side is the best3 slot (from the canonical topology), take the model's
    // occupant team there, map it to its group.
    if (m.a.startsWith("best3") && row.team_a) {
      const g = groupOfTeam.get(row.team_a);
      if (g) best3SlotToGroup[m.a] = g;
    }
    if (m.b.startsWith("best3") && row.team_b) {
      const g = groupOfTeam.get(row.team_b);
      if (g) best3SlotToGroup[m.b] = g;
    }
  }
  if (Object.keys(best3SlotToGroup).length !== 8) return null; // projected bracket incomplete

  return { groupOrder, best3SlotToGroup };
}

/** Canonical group membership, read fresh server-side so the API never trusts the client's options
 *  when validating a submission. */
export async function getGroupMembership(): Promise<GroupMembership> {
  const sb = await createClient();
  // scaling-guard-ok: teams is bounded by the tournament (48 rows, the qualified field)
  const { data, error } = await sb.from("teams").select("name, group_code");
  if (error) throw error;

  const byGroup: Record<string, string[]> = {};
  const all: string[] = [];
  for (const t of (data ?? []) as Pick<TeamRow, "name" | "group_code">[]) {
    (byGroup[t.group_code] ??= []).push(t.name);
    all.push(t.name);
  }
  return { byGroup, all };
}

/** The authoritative current run id at submission time - stamped into the bracket jsonb so the
 *  entry is pinned to the forecast it was made against. Null if no run is published. */
export async function getCurrentRunId(): Promise<string | null> {
  const sb = await createClient();
  const { data, error } = await sb.from("current_run").select("run_id").limit(1);
  if (error) return null;
  return (data?.[0] as { run_id: string } | undefined)?.run_id ?? null;
}
