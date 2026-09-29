"use client";

import { Check, ChevronRight, SunMoon } from "@/components/ui/icons";
import { useState, useSyncExternalStore } from "react";

import { PRESSABLE_ROW_CLASS, RowIcon } from "@/components/ui/link-row";
import { Sheet } from "@/components/ui/sheet";
import {
  APPEARANCE_LABELS,
  APPEARANCE_MODES,
  chooseAppearance,
  readStoredAppearance,
  subscribeAppearance,
  type Appearance,
} from "@/lib/appearance";
import { cn } from "@/lib/utils";

/**
 * The colours are already right when this mounts — the pre-paint initializer saw to that.
 * Only the row's value needs the stored preference, so the server snapshot is the neutral
 * default rather than a placeholder that would replace the row until hydration.
 */
function useAppearance(): Appearance {
  return useSyncExternalStore(subscribeAppearance, readStoredAppearance, () => "system" as const);
}

/** A Profile row that shows the current mode and opens the three choices in a sheet. */
export function AppearanceRow() {
  const appearance = useAppearance();
  const [open, setOpen] = useState(false);

  const choose = (mode: Appearance) => {
    chooseAppearance(mode);
    setOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Appearance: ${APPEARANCE_LABELS[appearance]}`}
        className={PRESSABLE_ROW_CLASS}
      >
        <RowIcon icon={SunMoon} />
        <span className="min-w-0 flex-1 font-medium">Appearance</span>
        <span className="shrink-0 text-sm text-ink-muted">{APPEARANCE_LABELS[appearance]}</span>
        <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Appearance">
        <ul className="ruled-list">
          {APPEARANCE_MODES.map((mode) => (
            <li key={mode}>
              <button
                type="button"
                onClick={() => choose(mode)}
                aria-pressed={appearance === mode}
                className={cn(
                  "flex min-h-14 w-full items-center justify-between gap-3 px-1 text-left font-medium active:bg-surface-raised",
                  appearance === mode ? "text-ink" : "text-ink-muted",
                )}
              >
                {APPEARANCE_LABELS[mode]}
                {appearance === mode && <Check className="shrink-0 text-accent" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </>
  );
}
