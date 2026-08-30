import { timingSafeEqual } from "node:crypto";

// Shared secret gate for the pipeline's machine-to-machine routes (/api/cron/tick, /api/revalidate).
// Constant-time compare; reads the presented secret from Authorization: Bearer <s> or x-cron-secret.
// The expected value is read from process.env by the caller and never logged or echoed.

/** Constant-time secret compare. False on any null/length/format mismatch, without leaking timing. */
export function secretMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false; // timingSafeEqual requires equal length; unequal -> reject
  return timingSafeEqual(a, b);
}

/** Pull the presented secret from Authorization: Bearer <s>, falling back to the x-cron-secret header. */
export function presentedSecret(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth && auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return req.headers.get("x-cron-secret");
}
