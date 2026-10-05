"use client";

import { useId } from "react";

import { SegmentedControl } from "./segmented-control";

const FIVE = ["1", "2", "3", "4", "5"].map((value) => ({ value, label: value }));
const FIVE_DOWN = [...FIVE].reverse();

/**
 * A 1–5 answer (board Check-in): its name, the five in a tray, the chosen one in ink, and what 1
 * and 5 mean under their own ends, so which way is better is read where the finger goes. Every
 * answer is optional and blank means unknown, so the chosen one is let go by tapping it again: a
 * mis-tap never stands as a reading.
 *
 * Scales whose 5 is the good end are drawn from 5 down (`descending`), so on one screen the good
 * end of every scale sits on the same side (owner, 5 October 2026). Only the drawing turns: the
 * number tapped is the number stored, so what a reading means never changes.
 */
export function ScaleField({
  label,
  name,
  ends,
  descending = false,
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  /** What 1 and 5 mean: ["poor", "great"]. */
  ends: readonly [string, string];
  /** Drawn 5 to 1, its good end first: Quality's "great" stands where fatigue's "fresh" does. */
  descending?: boolean;
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
        options={descending ? FIVE_DOWN : FIVE}
        defaultValue={defaultValue || undefined}
        columns={5}
        clearable
        aria-labelledby={id}
        aria-describedby={`${id}-ends${error ? ` ${id}-error` : ""}`}
        aria-invalid={error ? true : undefined}
      />
      <p id={`${id}-ends`} className="scale-ends">
        {descending ? (
          <>
            <span>5 {ends[1]}</span>
            <span>{ends[0]} 1</span>
          </>
        ) : (
          <>
            <span>1 {ends[0]}</span>
            <span>{ends[1]} 5</span>
          </>
        )}
      </p>
      {error && (
        <p id={`${id}-error`} role="alert" className="type-meta-small font-semibold">
          {error}
        </p>
      )}
    </div>
  );
}
