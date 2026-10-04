"use client";

import { useId } from "react";

import { SegmentedControl } from "./segmented-control";

const FIVE = ["1", "2", "3", "4", "5"].map((value) => ({ value, label: value }));

/**
 * A 1–5 answer (board Check-in): its name, the five in a tray, the chosen one in ink, and what 1
 * and 5 mean under their own ends, so which way is better is read where the finger goes (the
 * app's scales do not all run the same way).
 */
export function ScaleField({
  label,
  name,
  ends,
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  /** What 1 and 5 mean: ["poor", "great"]. */
  ends: readonly [string, string];
  defaultValue?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <div className="scale" data-field-error={error ? "true" : undefined}>
      <p id={id} className="scale-name">
        {label}
      </p>
      <SegmentedControl
        name={name}
        options={FIVE}
        defaultValue={defaultValue || undefined}
        columns={5}
        aria-labelledby={id}
        aria-describedby={`${id}-ends${error ? ` ${id}-error` : ""}`}
        aria-invalid={error ? true : undefined}
      />
      <p id={`${id}-ends`} className="scale-ends">
        <span>1 {ends[0]}</span>
        <span>{ends[1]} 5</span>
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="type-meta-small font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
