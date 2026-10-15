import { createClient } from "@supabase/supabase-js";
import { getCoachBackup, getSupabasePublicEnv } from "@/lib/env";
import { getClaimsOptions } from "@/lib/supabase/jwks";

export type VerifiedCoachClaims = Record<string, unknown>;

/** Receives verified claims only. A browser session or a token for another app is insufficient. */
export function authorizeCoachConnector(claims: VerifiedCoachClaims, now = Date.now()): boolean {
  const backup = getCoachBackup(),
    env = getSupabasePublicEnv();
  if (!backup || !env) return false;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  return (
    claims.sub === backup.ownerId &&
    claims.client_id === backup.clientId &&
    claims.iss === `${env.url.replace(/\/$/, "")}/auth/v1` &&
    claims.role === "authenticated" &&
    audiences.includes(backup.resource) &&
    typeof claims.exp === "number" &&
    claims.exp * 1000 > now
  );
}

export async function verifyCoachConnectorToken(
  token: string,
): Promise<VerifiedCoachClaims | null> {
  const env = getSupabasePublicEnv();
  if (!env) return null;
  const supabase = createClient(env.url, env.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const { data, error } = await supabase.auth.getClaims(token, getClaimsOptions());
  return error || !data ? null : data.claims;
}

export function coachResourceMetadata() {
  const backup = getCoachBackup(),
    env = getSupabasePublicEnv();
  if (!backup || !env) return null;
  return {
    resource: backup.resource,
    authorization_servers: [`${env.url.replace(/\/$/, "")}/auth/v1`],
    scopes_supported: ["openid", "email"],
    resource_name: "Overload house coach backup",
  };
}
