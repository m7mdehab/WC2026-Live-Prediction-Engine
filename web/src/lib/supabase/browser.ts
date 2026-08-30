import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client (anon key) for the admin login flow only. Uses the SSR browser
 * client so the email-OTP session is persisted to cookies that the server components + the
 * /api/admin route can read back (createClient in supabase/server.ts). Public pages never need
 * this - they read published data server-side.
 */
export function createBrowserSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. " +
        "Set them in web/.env.local (and in the Vercel project env)."
    );
  }
  return createBrowserClient(url, anon);
}
