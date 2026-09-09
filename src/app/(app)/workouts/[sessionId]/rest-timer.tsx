"use client";

import { useEffect, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { formatDuration } from "@/domain/pace";

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

/** Countdown bar that survives navigation within the session. */
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
    <div
      role="timer"
      className="fixed inset-x-0 z-30 border-t border-line bg-surface lg:left-48"
      style={{ bottom: "calc(var(--nav-height) + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-[var(--page-gutter)] py-2">
        <span className="text-sm text-ink-muted">Rest</span>
        <span
          className={
            remaining === 0
              ? "text-xl font-semibold text-accent tabular-nums"
              : "text-xl font-semibold tabular-nums"
          }
        >
          {remaining === 0 ? "Go" : formatDuration(remaining)}
        </span>
        <div className="flex gap-2">
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
