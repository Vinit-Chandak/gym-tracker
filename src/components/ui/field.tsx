"use client";

import { Children, cloneElement, isValidElement, useId, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { aboutLabel } from "./about-label";
import { Glyph } from "./glyphs";
import { InfoTip } from "./info-tip";

type ControlProps = {
  id?: string;
  type?: string;
  role?: string;
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean;
};

type FieldProps = {
  label: string;
  children: ReactNode;
  error?: string;
  /**
   * The line under the field, kept for what its value comes to or needs right now ("Checking…",
   * "135 g at 75.2 kg", what saving it will replace), never for help: help is `info`, and
   * "Optional" is `aside` (DESIGN.md, The Need-to-Know Rule).
   */
  hint?: string;
  /** Several choices share a label; each radio keeps its own label. */
  group?: boolean;
  /**
   * Keep the label for screen readers but not on screen, for a field that is its own section:
   * the section heading already says the name, and printing it twice is a stutter. A hidden
   * label takes its `info` tip with it, so a field that needs the tip keeps its label.
   */
  labelHidden?: boolean;
  info?: ReactNode;
  /** A word at the end of the label's line: "Optional" (board Welcome). */
  aside?: ReactNode;
  htmlFor?: string;
};

/** Keep help and errors out of the control's name, and never nest radio labels. */
export function Field({
  label,
  children,
  error,
  hint,
  info,
  aside,
  htmlFor,
  group,
  labelHidden,
}: FieldProps) {
  const generatedId = useId();
  const controls = Children.toArray(children);
  const control = controls.find(
    (child) => isValidElement<ControlProps>(child) && child.props.type !== "hidden",
  );
  // Some composite forms explain several inputs in one shared message (a lap, sign-in).
  // The input's own invalid state still marks its label and glyph, without repeating that message.
  const invalid = Boolean(
    error || (isValidElement<ControlProps>(control) && control.props["aria-invalid"]),
  );
  const controlId =
    htmlFor ??
    (isValidElement<ControlProps>(control) ? control.props.id : undefined) ??
    generatedId;
  const labelId = `${controlId}-label`;
  const feedbackId = `${controlId}-feedback`;
  const asideId = `${controlId}-aside`;
  // The label never shrinks below its longest word: at large text on a narrow phone its ⓘ and
  // aside fold under it, and it wraps between words ("Longest run") rather than inside one.
  const text = (
    <span id={labelId} className="max-w-full [overflow-wrap:break-word]">
      {label}
    </span>
  );

  return (
    <div className="ov-field min-w-0 space-y-1.5" data-field-error={invalid ? "true" : undefined}>
      <div
        className={
          labelHidden
            ? "sr-only"
            : cn(
                "ov-field-label flex flex-wrap items-center gap-x-1 text-[length:var(--ov-type-meta-small)] font-bold",
                // A field that cannot be saved says so in its label too (DESIGN.md, Inputs).
                invalid ? "text-danger-text" : "text-ink",
              )
        }
      >
        {!labelHidden && (
          <Glyph
            name="warn"
            className={cn(
              "field-invalid-glyph glyph-16 shrink-0 text-danger-glyph",
              !invalid && "hidden",
            )}
            aria-hidden
          />
        )}
        {group ? (
          text
        ) : (
          <label htmlFor={controlId} className="max-w-full">
            {text}
          </label>
        )}
        {info && <InfoTip label={aboutLabel(label)}>{info}</InfoTip>}
        {/* Read with the field ("Optional", a unit), not left for the eye alone. */}
        {aside && (
          <span
            id={asideId}
            className="ml-auto shrink-0 text-[length:var(--ov-type-meta-small)] font-medium text-ink-2"
          >
            {aside}
          </span>
        )}
      </div>
      {controls.map((child) => {
        if (child !== control || !isValidElement<ControlProps>(child)) return child;
        return cloneElement(child, {
          id: controlId,
          ...(group && child.type === "div" ? { role: child.props.role ?? "group" } : {}),
          // A control can be marked by a sentence that is not its own (a sign-in that did not
          // work is about both fields), so its own mark stands when the field has no error.
          "aria-invalid": error ? true : child.props["aria-invalid"],
          "aria-labelledby": group ? labelId : child.props["aria-labelledby"],
          "aria-describedby":
            [
              child.props["aria-describedby"],
              aside ? asideId : undefined,
              error || hint ? feedbackId : undefined,
            ]
              .filter(Boolean)
              .join(" ") || undefined,
        });
      })}
      {(error || hint) && (
        <span
          id={feedbackId}
          role={error ? "alert" : undefined}
          className={
            error
              ? "flex items-start gap-1.5 text-[length:var(--ov-type-meta-small)] font-bold text-danger-text"
              : "block text-[length:var(--ov-type-caption)] font-medium text-ink-2"
          }
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}
