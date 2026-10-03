"use client";

import { useState, useSyncExternalStore } from "react";

import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import { Sheet } from "@/components/ui/sheet";
import {
  APPEARANCE_LABELS,
  APPEARANCE_MODES,
  chooseAppearance,
  readStoredAppearance,
  subscribeAppearance,
  type Appearance,
} from "@/lib/appearance";

/**
 * The colours are already right when this mounts — the pre-paint initializer saw to that.
 * Only the row's value needs the stored preference, so the server snapshot is the neutral
 * default rather than a placeholder that would replace the row until hydration.
 */
function useAppearance(): Appearance {
  return useSyncExternalStore(subscribeAppearance, readStoredAppearance, () => "system" as const);
}

const MODE_GLYPH: Record<Appearance, GlyphName> = {
  system: "contrast",
  light: "sun",
  dark: "moon",
};

/**
 * A Profile row that shows the current mode and opens the three choices in a sheet (board
 * Appearance): each its glyph and its word, the chosen one checked in ink.
 */
export function AppearanceRow() {
  const appearance = useAppearance();
  const [open, setOpen] = useState(false);

  const choose = (mode: Appearance) => {
    chooseAppearance(mode);
    setOpen(false);
  };

  return (
    <li className="nav-row-item">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={`Appearance: ${APPEARANCE_LABELS[appearance]}`}
        className="nav-row w-full text-left"
      >
        <span className="mark-cell">
          <Glyph name="contrast" className="glyph-20" />
        </span>
        <span className="nav-row-label">Appearance</span>
        <span className="nav-row-value">{APPEARANCE_LABELS[appearance]}</span>
        <Glyph name="chevronRight" className="nav-row-chevron glyph-20 shrink-0" />
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Appearance">
        <ul role="radiogroup" aria-label="Appearance" className="mt-1">
          {APPEARANCE_MODES.map((mode) => (
            <li key={mode}>
              <button
                type="button"
                role="radio"
                aria-checked={appearance === mode}
                onClick={() => choose(mode)}
                className="sheet-row"
              >
                <span className="mark-cell">
                  <Glyph name={MODE_GLYPH[mode]} className="glyph-22" />
                </span>
                <span className="min-w-0 flex-1">{APPEARANCE_LABELS[mode]}</span>
                {appearance === mode && (
                  <span aria-hidden className="picker-chosen">
                    <Glyph name="check" className="glyph-15" />
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>
    </li>
  );
}
