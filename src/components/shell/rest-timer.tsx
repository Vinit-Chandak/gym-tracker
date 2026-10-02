"use client";

import { useEffect, useSyncExternalStore } from "react";

import { Close, Timer } from "@/components/ui/icons";
import { formatDuration } from "@/domain/pace";
import { cn } from "@/lib/utils";

/** How long the finished timer keeps showing "Go" before it clears itself. */
const LINGER_MS = 60_000;

const storageKey = (sessionId: string) => `overload:rest-timer:${sessionId}`;
const totalKey = (sessionId: string) => `overload:rest-timer:${sessionId}:total`;

const listeners = new Set<() => void>();
// A full or blocked store must only remove persistence, never the countdown itself.
const transientDeadlines = new Map<string, number | null>();
const transientTotals = new Map<string, number>();

function notify(): void {
  for (const listener of listeners) listener();
}

function readEndsAt(sessionId: string): number | null {
  const key = storageKey(sessionId);
  if (transientDeadlines.has(key)) {
    const value = transientDeadlines.get(key);
    if (value == null) return null;
    if (value > Date.now() - LINGER_MS) return value;
    transientDeadlines.delete(key);
    return null;
  }
  try {
    const raw = localStorage.getItem(key);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) && value > Date.now() - LINGER_MS ? value : null;
  } catch {
    return null;
  }
}

/** How long the current rest was set for, so the line along the strip can show what is left. */
function readTotal(sessionId: string): number | null {
  const key = totalKey(sessionId);
  const transient = transientTotals.get(key);
  if (transient !== undefined) return transient;
  try {
    const raw = localStorage.getItem(key);
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeEndsAt(sessionId: string, endsAt: number | null, totalSeconds?: number): void {
  const key = storageKey(sessionId);
  try {
    if (endsAt === null) localStorage.removeItem(key);
    else localStorage.setItem(key, String(endsAt));
    transientDeadlines.delete(key);
  } catch {
    transientDeadlines.set(key, endsAt);
  }
  if (totalSeconds !== undefined) {
    try {
      localStorage.setItem(totalKey(sessionId), String(totalSeconds));
      transientTotals.delete(totalKey(sessionId));
    } catch {
      transientTotals.set(totalKey(sessionId), totalSeconds);
    }
  }
  notify();
}

/** Remaining seconds (0 once finished, until it clears) or null when no timer is running. */
function readRemaining(sessionId: string): number | null {
  const endsAt = readEndsAt(sessionId);
  return endsAt === null ? null : Math.max(0, Math.round((endsAt - Date.now()) / 1000));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const interval = setInterval(listener, 1000);
  const onStorage = (event: StorageEvent) => {
    if (event.key === null) {
      transientDeadlines.clear();
      transientTotals.clear();
    } else {
      transientDeadlines.delete(event.key);
      transientTotals.delete(event.key);
    }
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    clearInterval(interval);
    window.removeEventListener("storage", onStorage);
  };
}

/** Start (or restart) the rest countdown for a session; called after a set is logged. */
export function startRestTimer(sessionId: string, seconds: number): void {
  writeEndsAt(sessionId, Date.now() + seconds * 1000, seconds);
}

/** The seconds left on a session's rest, or null when none is running; ticks once a second. */
export function useRestRemaining(sessionId: string): number | null {
  return useSyncExternalStore(
    subscribe,
    () => readRemaining(sessionId),
    () => null,
  );
}

/**
 * The countdown, as one line of the session strip: the time left in the data voice beside
 * its icon, a hairline along the strip's top edge draining as the rest runs out, and two small
 * controls. It reads a deadline rather than counting down a stored number, so it stays
 * correct across a route change, a backgrounded tab or a reload — only the displayed seconds
 * tick. It takes no more of the screen than one row of text: most of the time it is off.
 */
export function RestTimer({ sessionId }: { sessionId: string }) {
  const remaining = useRestRemaining(sessionId);

  useEffect(() => {
    if (remaining !== 0) return;
    const id = setTimeout(() => writeEndsAt(sessionId, null), LINGER_MS);
    return () => clearTimeout(id);
  }, [remaining, sessionId]);

  if (remaining === null) return null;

  const total = readTotal(sessionId);
  const fraction = total && total > 0 ? Math.min(1, remaining / total) : 0;
  const stop = () => writeEndsAt(sessionId, null);
  const extend = () => {
    const endsAt = readEndsAt(sessionId) ?? Date.now();
    const next = Math.max(endsAt, Date.now()) + 30_000;
    writeEndsAt(sessionId, next, Math.max(total ?? 0, Math.round((next - Date.now()) / 1000)));
  };

  return (
    <div role="timer" className="flex min-w-0 items-center gap-1">
      {/* What is left of the rest, drawn as a line along the strip's top edge. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[2px] origin-left bg-highlight transition-transform duration-1000 ease-linear"
        style={{ transform: `scaleX(${fraction})` }}
      />
      <Timer
        className={cn("shrink-0", remaining === 0 ? "text-ink" : "text-ink-muted")}
        aria-hidden
      />
      <span className={cn("min-w-[3.2ch] measure text-lg", remaining === 0 && "highlight px-1")}>
        {remaining === 0 ? "Go" : formatDuration(remaining)}
      </span>
      <button
        type="button"
        onClick={extend}
        className="ml-1 flex min-h-9 items-center rounded-control border border-line-strong px-2 text-xs font-medium text-ink transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
      >
        +30 s
      </button>
      <button
        type="button"
        onClick={stop}
        aria-label="Stop"
        className="flex size-9 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
      >
        <Close aria-hidden />
      </button>
    </div>
  );
}
