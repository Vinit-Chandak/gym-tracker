"use client";

import { useId, useState } from "react";

import { Glyph } from "./glyphs";

/**
 * A choice as a row (board Add fallback: "Machine · Any ⌄"): its name at the gutter, what is
 * chosen at the end with a chevron. The platform's own picker opens on it, so it is a native
 * select laid over the row, which also keeps it working in a form without JavaScript.
 */
export function SelectRow({
  label,
  name,
  options,
  defaultValue,
  value: controlled,
  onChange,
  error,
}: {
  label: string;
  /** Left out when the choice is held by the caller and submitted another way. */
  name?: string;
  options: readonly { value: string; label: string }[];
  defaultValue?: string;
  /** Controlled value; pair with `onChange`. */
  value?: string;
  onChange?: (value: string) => void;
  error?: string;
}) {
  const id = useId();
  const [own, setOwn] = useState(defaultValue ?? options[0]?.value ?? "");
  const value = controlled ?? own;
  const shown = options.find((option) => option.value === value) ?? options[0];
  return (
    <div data-field-error={error ? "true" : undefined}>
      <div className="select-row">
        <label htmlFor={id} className="font-bold">
          {label}
        </label>
        <span aria-hidden className="select-row-value">
          <span className="min-w-0 text-right [overflow-wrap:anywhere]">{shown?.label}</span>
          <Glyph name="chevronDown" className="glyph-18" />
        </span>
        <select
          id={id}
          name={name}
          value={value}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            if (controlled === undefined) setOwn(event.target.value);
            onChange?.(event.target.value);
          }}
          className="select-row-native"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      {error && (
        <p id={`${id}-error`} role="alert" className="type-meta-small font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
