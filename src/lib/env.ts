/**
 * Environment access. Values are read lazily at request time so the build never needs them.
 * Supabase's Vercel integration exposes POSTGRES_* names; those are accepted as fallbacks.
 */
export type SupabasePublicEnv = { url: string; anonKey: string };

export function getSupabasePublicEnv(): SupabasePublicEnv | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY;
  if (!url || !anonKey) return null;
  return { url, anonKey };
}

export function isSupabaseConfigured(): boolean {
  return getSupabasePublicEnv() !== null;
}

/**
 * Whether to log request timings (database transactions and the proxy's session check) to the
 * server log. Off by default; set `PERF_LOG=1` while investigating latency (ADR 0030).
 */
export function perfLogEnabled(): boolean {
  return process.env.PERF_LOG === "1";
}

/** Runtime connection string (transaction pooler on Supabase). Server-side only. */
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. See SETUP.md step 3.");
  }
  return url;
}

/** Connection string for migrations and seeding (session pooler / direct). */
export function getMigrationDatabaseUrl(): string {
  const url =
    process.env.DIRECT_DATABASE_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.DATABASE_URL ??
    process.env.POSTGRES_URL;
  if (!url) {
    throw new Error("DIRECT_DATABASE_URL (or DATABASE_URL) is not set. See SETUP.md step 3.");
  }
  return url;
}

/**
 * The secret the house-coach routine presents on `/api/coach/service`. Stored once on the
 * server and once as an API credential on the routine's cloud environment; never per user.
 * Anything shorter than 16 characters is treated as unset rather than accepted.
 */
export function getCoachServiceToken(): string | null {
  const token = process.env.COACH_SERVICE_TOKEN?.trim();
  return token && token.length >= 16 ? token : null;
}

/** Where the app fires the coach routine, and the per-routine token that lets it. */
export function getCoachRoutine(): { fireUrl: string; token: string } | null {
  const fireUrl = process.env.COACH_ROUTINE_FIRE_URL?.trim();
  const token = process.env.COACH_ROUTINE_FIRE_TOKEN?.trim();
  if (!fireUrl || !token) return null;
  try {
    if (new URL(fireUrl).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return { fireUrl, token };
}

/** Owner-only OAuth connection. No model API key or Claude credential is shared with ChatGPT. */
export function getCoachBackup() {
  const ownerId = process.env.COACH_BACKUP_OWNER_ID?.trim();
  const clientId = process.env.COACH_BACKUP_CLIENT_ID?.trim();
  const raw = process.env.COACH_BACKUP_RESOURCE_URL?.trim();
  if (process.env.COACH_BACKUP_ENABLED !== "true" || !ownerId || !clientId || !raw) return null;
  try {
    const resource = new URL(raw);
    if (
      resource.protocol !== "https:" ||
      resource.pathname !== "/api/coach/mcp" ||
      resource.search ||
      resource.hash ||
      resource.username ||
      resource.password
    )
      return null;
    return { ownerId, clientId, resource: resource.href, origin: resource.origin };
  } catch {
    return null;
  }
}

export function canRunCoachJobs(): boolean {
  return getCoachRoutine() !== null || getCoachBackup() !== null;
}

export function isCoachServiceConfigured(): boolean {
  return getCoachServiceToken() !== null || getCoachBackup() !== null;
}
