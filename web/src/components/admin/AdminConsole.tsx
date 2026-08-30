"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { AdminForm } from "@/components/admin/AdminForm";
import { PlayerStatsForm } from "@/components/admin/PlayerStatsForm";
import type { AdminEntryMatch, AdminPlayer } from "@/lib/types/events";

interface Props {
  matches: AdminEntryMatch[];
  players: AdminPlayer[];
  adminEmail: string;
  preview?: boolean;
}

type Tab = "results" | "players";

const tabBtn = (active: boolean) =>
  cn(
    "rounded-md px-4 py-2 text-sm font-medium transition",
    active ? "bg-confident text-white" : "bg-elevated text-secondary hover:text-fg"
  );

/** The protected /admin console. Two manual paths share the same auth gate + design tokens:
 *  result/event entry (the team flow) and the Phase 4 player-stat override (the always-correct
 *  system of record). A simple tab keeps each form focused without a second route. */
export function AdminConsole({ matches, players, adminEmail, preview }: Props) {
  const [tab, setTab] = useState<Tab>("results");

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Admin sections">
        <button type="button" role="tab" aria-selected={tab === "results"}
          className={tabBtn(tab === "results")} onClick={() => setTab("results")}>
          Results &amp; events
        </button>
        <button type="button" role="tab" aria-selected={tab === "players"}
          className={tabBtn(tab === "players")} onClick={() => setTab("players")}>
          Player stats
        </button>
      </div>

      {tab === "results" ? (
        <AdminForm matches={matches} adminEmail={adminEmail} preview={preview} />
      ) : (
        <PlayerStatsForm matches={matches} players={players} adminEmail={adminEmail} preview={preview} />
      )}
    </div>
  );
}
