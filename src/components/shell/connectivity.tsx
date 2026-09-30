"use client";

import { useSyncExternalStore } from "react";

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
  return online ? null : (
    <div
      role="status"
      className="sticky top-0 z-[var(--ov-z-notice)] bg-warning/15 px-4 py-2 text-center text-sm font-semibold text-warning backdrop-blur-xl"
    >
      You&apos;re offline. Set and activity drafts stay on this device; retry saving when connected.
    </div>
  );
}
