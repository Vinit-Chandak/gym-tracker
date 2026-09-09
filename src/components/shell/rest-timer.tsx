"use client";

import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { formatDuration } from "@/domain/pace";
import { cn } from "@/lib/utils";

/** How long the finished timer keeps showing "Go" before it clears itself. */
const LINGER_MS = 60_000;

const storageKey = (sessionId: string) => `overload:rest-timer:${sessionId}`;

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function readEndsAt(sessionId: string): number | null {
  try {
    const raw = localStorage.getItem(storageKey(sessionId));
    const value = raw ? Number(raw) : NaN;
    return Number.isFinite(value) && value > Date.now() - LINGER_MS ? value : null;
  } catch {
    return null;
  }
}

function writeEndsAt(sessionId: string, endsAt: number | null): void {
  try {
    if (endsAt === null) localStorage.removeItem(storageKey(sessionId));
    else localStorage.setItem(storageKey(sessionId), String(endsAt));
  } catch {
    // Storage unavailable: the timer simply does not survive navigation.
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
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    clearInterval(interval);
    window.removeEventListener("storage", listener);
  };
}

/** Start (or restart) the rest countdown for a session; called after a set is logged. */
export function startRestTimer(sessionId: string, seconds: number): void {
  writeEndsAt(sessionId, Date.now() + seconds * 1000);
}

/**
 * Countdown row. It reads a deadline rather than counting down a stored number, so it stays
 * correct across a route change, a backgrounded tab or a reload — only the displayed seconds
 * tick. `SessionChrome` positions it above the navigation; it draws no bar of its own, so it
 * cannot become a second resume strip.
 */
export function RestTimer({ sessionId }: { sessionId: string }) {
  const remaining = useSyncExternalStore(
    subscribe,
    () => readRemaining(sessionId),
    () => null,
  );

  useEffect(() => {
    if (remaining !== 0) return;
    const id = setTimeout(() => writeEndsAt(sessionId, null), LINGER_MS);
    return () => clearTimeout(id);
  }, [remaining, sessionId]);

  if (remaining === null) return null;

  const stop = () => writeEndsAt(sessionId, null);
  const extend = () => {
    const endsAt = readEndsAt(sessionId) ?? Date.now();
    writeEndsAt(sessionId, Math.max(endsAt, Date.now()) + 30_000);
  };

  return (
    <div role="timer" className="border-t border-line bg-surface">
      <div className="page-width flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
        <span className="text-xs text-ink-muted">Rest</span>
        <span className={cn("text-lg font-medium tabular-nums", remaining === 0 && "text-accent")}>
          {remaining === 0 ? "Go" : formatDuration(remaining)}
        </span>
        <div className="flex gap-1">
          <Button variant="secondary" size="sm" onClick={extend}>
            +30 s
          </Button>
          <Button variant="ghost" size="sm" onClick={stop}>
            Stop
          </Button>
        </div>
      </div>
    </div>
  );
}
