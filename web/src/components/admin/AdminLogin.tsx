"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { Tag } from "@/components/ui/Tag";
import { Label, TextInput } from "@/components/admin/fields";
import { createBrowserSupabase } from "@/lib/supabase/browser";

type Props =
  | { state: "unauthenticated" }
  | { state: "forbidden"; email: string };

const btn =
  "inline-flex items-center justify-center rounded-md bg-confident px-4 py-2 text-sm " +
  "font-semibold text-white transition hover:bg-[var(--confident-hover)] disabled:opacity-50";

/** The /admin gate UI. Unauthenticated → email one-time-code sign-in (Supabase Auth OTP, which
 *  persists the session to cookies the server gate reads back). Forbidden → signed in but not on
 *  admin_allowlist; offer sign-out. Either way the entry form is never rendered here. */
export function AdminLogin(props: Props) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    try {
      const sb = createBrowserSupabase();
      const { error } = await sb.auth.signInWithOtp({ email: email.trim() });
      if (error) throw error;
      setPhase("code");
      setMsg(`We emailed a 6-digit code to ${email.trim()}. Enter it below.`);
    } catch (e2) {
      setErr(authMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    try {
      const sb = createBrowserSupabase();
      const { error } = await sb.auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
      if (error) throw error;
      // session cookie is set → re-run the server gate
      router.refresh();
    } catch (e2) {
      setErr(authMessage(e2));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      const sb = createBrowserSupabase();
      await sb.auth.signOut();
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="mb-2 flex items-center gap-3">
        <h1 className="font-display text-2xl font-bold text-fg">Admin</h1>
        <Tag variant="neutral">Protected</Tag>
      </div>

      {props.state === "forbidden" ? (
        <Card className="mt-4">
          <p className="text-sm text-fg">
            Signed in as <span className="font-medium">{props.email}</span>, but this account isn’t on
            the admin allowlist.
          </p>
          <p className="mt-1 text-xs text-secondary">
            Manual result &amp; event entry is restricted to allowlisted operators
            (<code className="text-xs">admin_allowlist</code> / <code className="text-xs">is_admin()</code>).
          </p>
          <button type="button" onClick={signOut} disabled={busy} className={`${btn} mt-4`}>
            Sign out
          </button>
        </Card>
      ) : (
        <Card className="mt-4">
          <p className="mb-4 text-sm text-secondary">
            Sign in to enter results and match events. Access is limited to allowlisted operators;
            unauthenticated visitors are blocked.
          </p>

          {phase === "email" ? (
            <form onSubmit={sendCode} className="space-y-3">
              <div>
                <Label htmlFor="admin-email">Email</Label>
                <TextInput
                  id="admin-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <button type="submit" disabled={busy || !email.trim()} className={btn}>
                {busy ? "Sending…" : "Email me a sign-in code"}
              </button>
            </form>
          ) : (
            <form onSubmit={verify} className="space-y-3">
              <div>
                <Label htmlFor="admin-code">6-digit code</Label>
                <TextInput
                  id="admin-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="tnum tracking-[0.3em]"
                />
              </div>
              <div className="flex items-center gap-3">
                <button type="submit" disabled={busy || !code.trim()} className={btn}>
                  {busy ? "Verifying…" : "Verify & sign in"}
                </button>
                <button
                  type="button"
                  onClick={() => { setPhase("email"); setCode(""); setMsg(null); setErr(null); }}
                  className="text-xs text-secondary hover:text-fg"
                >
                  Use a different email
                </button>
              </div>
            </form>
          )}

          {msg ? <p className="mt-3 text-xs text-confident">{msg}</p> : null}
          {err ? <p className="mt-3 text-xs text-down">{err}</p> : null}
        </Card>
      )}
    </div>
  );
}

function authMessage(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/NEXT_PUBLIC_SUPABASE/.test(m)) {
    return "Auth isn’t configured in this environment (missing Supabase env). Set NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY.";
  }
  return m || "Something went wrong. Try again.";
}
