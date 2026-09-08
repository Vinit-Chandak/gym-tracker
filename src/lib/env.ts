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
