"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { Sheet } from "@/components/ui/sheet";
import { formatDuration } from "@/domain/pace";
import { cn } from "@/lib/utils";

/** How long the finished timer keeps showing "Go" before it clears itself. */
const LINGER_MS = 60_000;

const storageKey = (sessionId: string) => `overload:rest-timer:${sessionId}`;
/** The whole rest, so the dial can say how much of it is left. */
const totalKey = (sessionId: string) => `overload:rest-timer-total:${sessionId}`;

const listeners = new Set<() => void>();
// A full or blocked store must only remove persistence, never the countdown itself.
const transientDeadlines = new Map<string, number | null>();
const transientTotals = new Map<string, number | null>();

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

/** Milliseconds the running rest was set for; null when nothing says (a timer from before). */
function readTotal(sessionId: string): number | null {
  const key = totalKey(sessionId);
  if (transientTotals.has(key)) return transientTotals.get(key) ?? null;
  try {
    const value = Number(localStorage.getItem(key) ?? NaN);
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeEndsAt(sessionId: string, endsAt: number | null, total: number | null = null): void {
  const key = storageKey(sessionId);
  const whole = totalKey(sessionId);
  try {
    if (endsAt === null) {
      localStorage.removeItem(key);
      localStorage.removeItem(whole);
    } else {
      localStorage.setItem(key, String(endsAt));
      if (total === null) localStorage.removeItem(whole);
      else localStorage.setItem(whole, String(total));
    }
    transientDeadlines.delete(key);
    transientTotals.delete(whole);
  } catch {
    transientDeadlines.set(key, endsAt);
    transientTotals.set(whole, endsAt === null ? null : total);
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
  writeEndsAt(sessionId, Date.now() + seconds * 1000, seconds * 1000);
}

/** The running rest: seconds left and the whole of it, read from one deadline. */
function useRest(sessionId: string) {
  const remaining = useSyncExternalStore(
    subscribe,
    () => readRemaining(sessionId),
    () => null,
  );
  const total = useSyncExternalStore(
    subscribe,
    () => readTotal(sessionId),
    () => null,
  );

  useEffect(() => {
    if (remaining !== 0) return;
    const id = setTimeout(() => writeEndsAt(sessionId, null), LINGER_MS);
    return () => clearTimeout(id);
  }, [remaining, sessionId]);

  const stop = () => writeEndsAt(sessionId, null);
  const extend = () => {
    const now = Date.now();
    const endsAt = readEndsAt(sessionId) ?? now;
    const whole = readTotal(sessionId);
    // The dial keeps saying how much of the rest is left: a running rest grows by thirty
    // seconds; one already over starts again as thirty seconds, its dial full.
    if (endsAt > now)
      writeEndsAt(sessionId, endsAt + 30_000, whole === null ? null : whole + 30_000);
    else writeEndsAt(sessionId, now + 30_000, 30_000);
  };
  return { remaining, total, stop, extend };
}

/**
 * Countdown row. It reads a deadline rather than counting down a stored number, so it stays
 * correct across a route change, a backgrounded tab or a reload — only the displayed seconds
 * tick. `SessionChrome` positions it above the navigation; it draws no bar of its own, so it
 * cannot become a second resume strip.
 */
export function RestTimer({ sessionId }: { sessionId: string }) {
  const { remaining, stop, extend } = useRest(sessionId);
  if (remaining === null) return null;

  return (
    <div role="timer" className="border-t border-hair bg-surface">
      <div className="page-width flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-1.5">
        <span className="type-caption text-ink-2">Rest</span>
        <span className="type-figure-s">{remaining === 0 ? "Go" : formatDuration(remaining)}</span>
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

/**
 * The rest as a dial (DESIGN.md, Rest): its outline, and the rest still to run as a wedge from
 * twelve o'clock, emptying as it runs.
 */
export function RestDial({ fraction, className }: { fraction: number; className?: string }) {
  const r = 6.2;
  const frac = Math.min(0.999, Math.max(0, fraction));
  const a = Math.PI * 2 * frac;
  const x = 9 + r * Math.sin(a);
  const y = 9 - r * Math.cos(a);
  return (
    <svg viewBox="0 0 18 18" aria-hidden className={cn("block shrink-0", className)}>
      <circle cx="9" cy="9" r="8" fill="none" stroke="currentColor" strokeWidth="1.6" />
      {fraction >= 0.999 ? (
        <circle cx="9" cy="9" r={r} fill="currentColor" />
      ) : frac > 0 ? (
        <path
          d={`M9 9V${(9 - r).toFixed(2)}A${r} ${r} 0 ${a > Math.PI ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`}
          fill="currentColor"
        />
      ) : null}
    </svg>
  );
}

/** "2 minutes 14 seconds", for the pill's name. */
function spokenTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  const part = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (minutes === 0) return part(rest, "second");
  return rest === 0
    ? part(minutes, "minute")
    : `${part(minutes, "minute")} ${part(rest, "second")}`;
}

/**
 * The rest pill (DESIGN.md, Rest): surface, 36 pt in a 44-pt target, the dial and the time. One
 * tap opens +30 s and Stop. At zero it reads Go for a minute. It lives in the session's header
 * and shows only while a rest runs.
 */
export function RestPill({ sessionId }: { sessionId: string }) {
  const { remaining, total, stop, extend } = useRest(sessionId);
  const [open, setOpen] = useState(false);
  if (remaining === null) return null;
  const go = remaining === 0;
  const fraction = total ? Math.min(1, (remaining * 1000) / total) : 1;
  const time = go ? "Go" : formatDuration(remaining);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className="relative flex min-h-[var(--ov-target-header)] shrink-0 items-center"
      >
        <span className="sr-only">{go ? "Rest over." : "Rest,"}</span>
        <span
          className={cn(
            "flex min-h-[calc(36px+var(--ov-grow))] items-center gap-[calc(4px+0.1875rem)] rounded-rest-pill pr-[calc(8px+0.25rem)] pl-[calc(6px+0.1875rem)]",
            go ? "bg-ink text-on-ink" : "bg-surface text-ink",
          )}
        >
          {go ? (
            <Glyph name="rest" className="glyph-18" />
          ) : (
            <RestDial fraction={fraction} className="glyph-18" />
          )}
          <span role="timer" className="type-figure-s">
            {time}
          </span>
        </span>
        <span className="sr-only">
          {go ? "Add 30 seconds or stop" : "left. Add 30 seconds or stop"}
        </span>
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Rest">
        <p className="mt-2 type-figure-l" aria-live="off">
          {go ? "Go" : time}
          {!go && <span className="sr-only"> left: {spokenTime(remaining)}</span>}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="tonal" size="lg" onClick={extend}>
            +30 s
          </Button>
          <Button
            variant="outline"
            size="lg"
            onClick={() => {
              stop();
              setOpen(false);
            }}
          >
            Stop
          </Button>
        </div>
      </Sheet>
    </>
  );
}
