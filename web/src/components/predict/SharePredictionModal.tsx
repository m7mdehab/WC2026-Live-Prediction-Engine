"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Flag } from "@/components/ui/Flag";
import { FINAL_ID, KO_MATCHES, matchParticipants } from "@/lib/types/brackets";
import type { PredictGroup, GroupStanding } from "@/lib/types/brackets";

// Where recipients land: the predict page itself, so a tap goes straight to making their own
// bracket. It inherits the branded OpenGraph card (web/src/app/opengraph-image.tsx), so the link
// unfurls with the site's art on every platform - no per-submission image needed.
const SHARE_URL = "https://presaira.com/predict";
const SHARE_TITLE = "My World Cup 2026 bracket on Presaira";

// The two semi-final ties (M101, M102); their four participants are the user's semi-finalists.
const SF_IDS = KO_MATCHES.filter((m) => m.round === "SF").map((m) => m.id);

// Single source of truth for the share copy (jargon-free, no em-dash). The champion is the only
// interpolation; never any PII. The trailing colon leads into the appended URL.
function shareText(champion: string): string {
  return `I backed ${champion} to win World Cup 2026 on Presaira and scored my bracket against the AI's forecast. Think you can beat the model? Make yours:`;
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v13M12 3l-4 4M12 3l4 4" />
      <path d="M5 13v5a2 2 0 002 2h10a2 2 0 002-2v-5" />
    </svg>
  );
}

function CopyIcon({ done }: { done: boolean }) {
  if (done) {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M5 12l5 5L20 6" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 012-2h10" />
    </svg>
  );
}

/** A compact team row: optional leading badge + flag + truncating name. Used for finalists,
 *  semi-finalists, and the 12 group winners so they stay on one tidy line at 390px. */
function TeamChip({ team, badge }: { team: string; badge?: React.ReactNode }) {
  return (
    <span className="flex min-w-0 items-center gap-2 rounded-md border border-border bg-bg-subtle px-2.5 py-1.5">
      {badge}
      <Flag team={team} size="text-sm" link={false} />
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{team}</span>
    </span>
  );
}

function SocialLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center justify-center rounded-md border border-border bg-surface px-2 py-2 text-xs font-semibold text-secondary transition-colors hover:border-gold-line hover:text-fg"
    >
      {label}
    </a>
  );
}

/**
 * Post-submit share sheet. Auto-opens on a successful submission and is reopenable from the
 * Confirmation. Renders the user's own picks only (champion, finalists, semi-finalists, the 12 group
 * winners) - never any PII (email / linkedin / ip never reach this component). Share actions point
 * recipients at /presaira.com/predict to make their own bracket.
 */
export function SharePredictionModal({
  open,
  onClose,
  champion,
  groups,
  standings,
  r32Slots,
  picks,
}: {
  open: boolean;
  onClose: () => void;
  champion: string;
  groups: PredictGroup[];
  standings: Record<string, GroupStanding>;
  r32Slots: Record<string, string>;
  picks: Record<string, string>;
}) {
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [canWebShare, setCanWebShare] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // client-mount: portal target + Web Share feature-detect (no navigator at SSR). Intentional.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
    setCanWebShare(typeof navigator !== "undefined" && typeof navigator.share === "function");
  }, []);

  // Scroll-lock the page body while the sheet is open; restore the prior value on close.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus the sheet on open so Escape + screen readers engage immediately.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // Revert the "Copied!" affordance after a beat.
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1800);
    return () => clearTimeout(t);
  }, [copied]);

  const finalists = useMemo(() => {
    const [a, b] = matchParticipants(FINAL_ID, r32Slots, picks);
    return [a, b].filter(Boolean) as string[];
  }, [r32Slots, picks]);

  const semifinalists = useMemo(() => {
    const out: string[] = [];
    for (const id of SF_IDS) {
      const [a, b] = matchParticipants(id, r32Slots, picks);
      if (a) out.push(a);
      if (b) out.push(b);
    }
    return out;
  }, [r32Slots, picks]);

  const groupWinners = useMemo(
    () =>
      groups
        .map((g) => ({ code: g.group_code, team: standings[g.group_code]?.first }))
        .filter((x): x is { code: string; team: string } => Boolean(x.team)),
    [groups, standings]
  );

  const text = shareText(champion);
  const encUrl = encodeURIComponent(SHARE_URL);
  const encText = encodeURIComponent(text);
  const encTextUrl = encodeURIComponent(`${text} ${SHARE_URL}`);
  const xUrl = `https://x.com/intent/tweet?text=${encText}&url=${encUrl}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encUrl}`;
  const whatsappUrl = `https://wa.me/?text=${encTextUrl}`;

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${text} ${SHARE_URL}`);
      setCopied(true);
    } catch {
      /* clipboard blocked - the social buttons remain available */
    }
  }

  async function webShare() {
    try {
      await navigator.share({ title: SHARE_TITLE, text, url: SHARE_URL });
    } catch {
      /* user canceled or share unavailable - no-op */
    }
  }

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* backdrop - click-outside closes */}
      <button
        type="button"
        aria-label="Close share dialog"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
      />

      {/* sheet */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-modal-title"
        tabIndex={-1}
        className="relative z-10 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-card border border-gold-line bg-surface shadow-[var(--shadow-card)] outline-none"
      >
        <div className="h-1.5 w-full bg-gradient-to-r from-gold-strong via-gold to-gold-strong" />

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-2.5 top-3 grid h-8 w-8 place-items-center rounded-full text-secondary transition-colors hover:bg-elevated hover:text-fg"
        >
          <CloseIcon />
        </button>

        <div className="px-5 pb-5 pt-4">
          <h2 id="share-modal-title" className="font-display text-base font-semibold text-fg">
            Your World Cup 2026 bracket
          </h2>

          {/* Champion */}
          <div className="champion-surface mt-3 rounded-card border border-gold-line p-4 text-center">
            <span className="champion-flag-ring mx-auto inline-flex rounded-full">
              <Flag team={champion} size="text-4xl" className="rounded-full" link={false} />
            </span>
            <div className="mt-3 truncate text-xl font-bold text-fg">{champion}</div>
            <p className="mt-0.5 text-xs text-secondary">Your champion to win it all</p>
          </div>

          {/* Finalists */}
          <section className="mt-4">
            <h3 className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted uppercase">Finalists</h3>
            <div className="grid grid-cols-2 gap-2">
              {finalists.map((t) => (
                <TeamChip key={t} team={t} />
              ))}
            </div>
          </section>

          {/* Semi-finalists */}
          <section className="mt-4">
            <h3 className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted uppercase">Semi-finalists</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {semifinalists.map((t) => (
                <TeamChip key={t} team={t} />
              ))}
            </div>
          </section>

          {/* Group winners */}
          <section className="mt-4">
            <h3 className="mb-1.5 text-[10px] font-semibold tracking-wider text-muted uppercase">Group winners</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {groupWinners.map((g) => (
                <TeamChip
                  key={g.code}
                  team={g.team}
                  badge={
                    <span
                      aria-hidden
                      className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-gold/15 text-[9px] font-bold text-gold"
                    >
                      {g.code}
                    </span>
                  }
                />
              ))}
            </div>
          </section>

          {/* CTA + share actions */}
          <p className="mt-5 text-center text-sm font-semibold text-fg">Dare a friend to beat the AI.</p>

          <div className="mt-3 space-y-2">
            {canWebShare ? (
              <button
                type="button"
                onClick={webShare}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-gold px-5 py-2.5 text-sm font-semibold text-on-gold transition-colors hover:bg-gold-strong"
              >
                <ShareIcon />
                Share
              </button>
            ) : null}

            <button
              type="button"
              onClick={copyLink}
              aria-live="polite"
              className="flex w-full items-center justify-center gap-2 rounded-full border border-gold-line bg-surface px-5 py-2.5 text-sm font-semibold text-fg transition-colors hover:bg-elevated"
            >
              <CopyIcon done={copied} />
              {copied ? "Copied!" : "Copy link"}
            </button>

            <div className="grid grid-cols-3 gap-2">
              <SocialLink href={xUrl} label="X" />
              <SocialLink href={linkedinUrl} label="LinkedIn" />
              <SocialLink href={whatsappUrl} label="WhatsApp" />
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
