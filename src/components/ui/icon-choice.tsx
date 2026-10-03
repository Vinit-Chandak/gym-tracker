"use client";

import { Glyph, type GlyphName } from "./glyphs";

/**
 * A choice of two or three as tiles (boards Log a run, a ride, a swim: where; Gym step: the
 * kind of place): each its glyph and its word, the chosen one in ink. A radio group, so the
 * form posts it without JavaScript.
 */
export function IconChoice({
  name,
  options,
  defaultValue,
  value,
  onChange,
  label = "Where",
}: {
  name: string;
  options: readonly { value: string; label: string; glyph: GlyphName }[];
  defaultValue?: string;
  /** Controlled value; pair with `onChange`. */
  value?: string;
  onChange?: (value: string) => void;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="where-choice">
      {options.map((option) => (
        <label key={option.value} className="where-choice-option">
          <input
            type="radio"
            name={name}
            value={option.value}
            {...(value !== undefined
              ? { checked: value === option.value, onChange: () => onChange?.(option.value) }
              : { defaultChecked: defaultValue === option.value })}
            className="peer sr-only"
          />
          <span className="where-choice-tile">
            <Glyph name={option.glyph} className="glyph-26" />
            <span>{option.label}</span>
          </span>
        </label>
      ))}
    </div>
  );
}
