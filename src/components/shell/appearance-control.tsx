"use client";

import { useSyncExternalStore } from "react";

import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  APPEARANCE_LABELS,
  APPEARANCE_MODES,
  APPEARANCE_STORAGE_KEY,
  applyAppearance,
  readStoredAppearance,
  type Appearance,
} from "@/lib/appearance";

const OPTIONS = APPEARANCE_MODES.map((value) => ({ value, label: APPEARANCE_LABELS[value] }));

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  // A change in another tab is a storage event; the same tab notifies its own listeners.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * The colours are already right when this mounts — the pre-paint initializer saw to that.
 * Only the selected pill needs the stored value, so the server snapshot is the neutral
 * default rather than a placeholder that would replace the control until hydration.
 */
export function useAppearance(): Appearance {
  return useSyncExternalStore(subscribe, readStoredAppearance, () => "system" as const);
}

export function AppearanceControl() {
  const appearance = useAppearance();

  const choose = (mode: Appearance) => {
    // Paint first, persist second: a full storage quota must not cost the user the change.
    applyAppearance(mode);
    try {
      localStorage.setItem(APPEARANCE_STORAGE_KEY, mode);
    } catch {
      // Device-local persistence only; this session still shows the chosen mode.
    }
    for (const listener of listeners) listener();
  };

  return (
    <SegmentedControl
      name="appearance"
      aria-label="Appearance"
      options={OPTIONS}
      value={appearance}
      onChange={choose}
    />
  );
}
