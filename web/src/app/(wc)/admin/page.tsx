import { getAdminGate, getAdminPlayers, getEntryMatches } from "@/lib/data/events";
import { AdminLogin } from "@/components/admin/AdminLogin";
import { AdminConsole } from "@/components/admin/AdminConsole";
import type { AdminEntryMatch, AdminPlayer } from "@/lib/types/events";

// Protected manual-entry route (scope_lock §2.1 #16, §8, §2.2 #22). Gated on the Supabase Auth
// session + admin_allowlist / is_admin(); unauthenticated visitors are blocked and only ever see
// the sign-in card. Re-evaluated per request (the API routes re-check auth independently too).
//
// Two manual paths live here: the score/event entry (the team result flow) and the Phase 4 player-
// stat override (the always-correct system of record for per-match player lines).
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const gate = await getAdminGate();

  if (gate.state === "unauthenticated") return <AdminLogin state="unauthenticated" />;
  if (gate.state === "forbidden") return <AdminLogin state="forbidden" email={gate.email} />;

  // ok | preview → render the console (both forms)
  let matches: AdminEntryMatch[] = [];
  let players: AdminPlayer[] = [];
  try {
    matches = await getEntryMatches();
  } catch (err) {
    console.error("Failed to load entry matches:", err);
  }
  try {
    players = await getAdminPlayers();
  } catch (err) {
    console.error("Failed to load players:", err);
  }

  return (
    <AdminConsole
      matches={matches}
      players={players}
      adminEmail={gate.email}
      preview={gate.state === "preview"}
    />
  );
}
