/**
 * The project's public JWT signing keys, handed to `getClaims()` so a session can be verified
 * without a network round trip.
 *
 * Supabase signs sessions with an asymmetric key and publishes the public half at
 * `/auth/v1/.well-known/jwks.json`. The client library fetches that document once per process
 * and caches it, which is fine on a long-running server but not on serverless functions: every
 * cold instance, and the proxy and the page run as separate ones, fetched the keys again before
 * it could answer anything. Shipping the same public document in `SUPABASE_JWKS` removes that
 * request. Keys not found in it, after a rotation for instance, still fall back to fetching.
 */
import type { JWK } from "@supabase/supabase-js";

export type JsonWebKeySet = { keys: JWK[] };

let parsed: JsonWebKeySet | null | undefined;

function isKey(value: unknown): value is JWK {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { kty?: unknown }).kty === "string" &&
    Array.isArray((value as { key_ops?: unknown }).key_ops)
  );
}

/** Parses a JWKS document; null when it is not one. */
export function parseJwks(raw: string | undefined): JsonWebKeySet | null {
  if (!raw?.trim()) return null;
  try {
    const value: unknown = JSON.parse(raw);
    const keys = (value as { keys?: unknown } | null)?.keys;
    if (!Array.isArray(keys) || keys.length === 0 || !keys.every(isKey)) return null;
    return { keys };
  } catch {
    return null;
  }
}

/** Options for `supabase.auth.getClaims()`: the embedded key set when one is configured. */
export function getClaimsOptions(): { jwks: JsonWebKeySet } | undefined {
  if (parsed === undefined) {
    parsed = parseJwks(process.env.SUPABASE_JWKS);
    if (parsed === null && process.env.SUPABASE_JWKS?.trim()) {
      console.warn("SUPABASE_JWKS is set but is not a JSON Web Key Set; ignoring it.");
    }
  }
  return parsed ? { jwks: parsed } : undefined;
}
