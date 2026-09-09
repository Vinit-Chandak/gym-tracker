"use client";

import { useEffect, useSyncExternalStore } from "react";

function subscribe(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}
export function useOnline() {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}

export function Connectivity() {
  const online = useOnline();
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* Online use still works if registration is unavailable. */
      });
    }
  }, []);
  return online ? null : (
    <div
      role="status"
      className="sticky top-0 z-[var(--ov-z-notice)] border-b border-warning bg-surface px-4 py-2 text-center text-sm text-warning"
    >
      You&apos;re offline. Set drafts stay on this device; retry saving when connected.
    </div>
  );
}
