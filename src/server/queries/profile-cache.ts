/**
 * A short-lived, per-process memory of profile rows, keyed by account.
 *
 * Every protected screen needs the profile (time zone, unit, whether onboarding finished) before
 * it can render, and reading it cost a transaction of its own on every request. A profile rarely
 * changes, so one instance keeps each account's row for a minute.
 *
 * Two rules keep a stale copy from ever being wrong in a way that matters:
 * - Only finished-onboarding profiles are stored. A `null` `onboardedAt` sends the account to
 *   `/welcome`, and a stale copy of that could bounce someone who has just finished setup.
 * - Whoever writes the profile stamps the browser with the time of the write (a cookie). A copy
 *   read before that moment is ignored, even on an instance that never saw the write.
 */
export type CachedProfile = { onboardedAt: Date | null };

export class ProfileCache<T extends CachedProfile> {
  private readonly entries = new Map<string, { profile: T; readAt: number }>();
  private readonly pending = new Map<string, { promise: Promise<T>; readAt: number }>();

  constructor(private readonly ttlMs: number) {}

  /**
   * The cached profile, or null when there is none, it is older than the TTL, or it was read
   * before `changedAt` (the moment of the account's last profile write, as the browser reports it).
   */
  get(id: string, changedAt: number, now = Date.now()): T | null {
    const entry = this.entries.get(id);
    if (!entry) return null;
    if (now - entry.readAt >= this.ttlMs || entry.readAt < changedAt) {
      this.entries.delete(id);
      return null;
    }
    return entry.profile;
  }

  /** Remembers a profile read at `readAt`; unfinished onboarding is never remembered. */
  set(id: string, profile: T, readAt: number): void {
    if (profile.onboardedAt === null) this.entries.delete(id);
    else {
      if (!this.entries.has(id) && this.entries.size >= 256) {
        this.entries.delete(this.entries.keys().next().value!);
      }
      this.entries.set(id, { profile, readAt });
    }
  }

  /** Parallel page/prefetch requests share a miss without extending the freshness window. */
  async read(id: string, changedAt: number, load: () => Promise<T>): Promise<T> {
    const cached = this.get(id, changedAt);
    if (cached) return cached;
    const waiting = this.pending.get(id);
    if (waiting && waiting.readAt >= changedAt) return waiting.promise;

    const entry = { promise: Promise.resolve().then(load), readAt: Date.now() };
    this.pending.set(id, entry);
    try {
      const profile = await entry.promise;
      // A write may have invalidated this read while the database was answering it.
      if (this.pending.get(id) === entry) this.set(id, profile, entry.readAt);
      return profile;
    } finally {
      if (this.pending.get(id) === entry) this.pending.delete(id);
    }
  }

  forget(id: string): void {
    this.entries.delete(id);
    this.pending.delete(id);
  }

  clear(): void {
    this.entries.clear();
    this.pending.clear();
  }
}
