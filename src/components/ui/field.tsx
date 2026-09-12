"use client";

import { Children, cloneElement, isValidElement, useId, type ReactNode } from "react";

import { InfoTip } from "./info-tip";

type ControlProps = {
  id?: string;
  type?: string;
  "aria-describedby"?: string;
  "aria-labelledby"?: string;
  "aria-invalid"?: boolean;
};

type FieldProps = {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  /** Several choices share a label; each radio keeps its own label. */
  group?: boolean;
  info?: ReactNode;
  htmlFor?: string;
};

/** Keep help and errors out of the control's name, and never nest radio labels. */
export function Field({ label, children, error, hint, info, htmlFor, group }: FieldProps) {
  const generatedId = useId();
  const controls = Children.toArray(children);
  const control = controls.find(
    (child) => isValidElement<ControlProps>(child) && child.props.type !== "hidden",
  );
  const controlId =
    htmlFor ??
    (isValidElement<ControlProps>(control) ? control.props.id : undefined) ??
    generatedId;
  const labelId = `${controlId}-label`;
  const feedbackId = `${controlId}-feedback`;
  const text = <span id={labelId}>{label}</span>;

  return (
    <div className="min-w-0 space-y-1.5" data-field-error={error ? "true" : undefined}>
      <div className="flex items-center gap-1 text-sm font-medium text-ink-muted">
        {group ? text : <label htmlFor={controlId}>{text}</label>}
        {info && <InfoTip label={`About ${label.toLowerCase()}`}>{info}</InfoTip>}
      </div>
      {controls.map((child) => {
        if (child !== control || !isValidElement<ControlProps>(child)) return child;
        return cloneElement(child, {
          id: controlId,
          "aria-invalid": error ? true : undefined,
          "aria-labelledby": group ? labelId : child.props["aria-labelledby"],
          "aria-describedby":
            [child.props["aria-describedby"], error || hint ? feedbackId : undefined]
              .filter(Boolean)
              .join(" ") || undefined,
        });
      })}
      {(error || hint) && (
        <span
          id={feedbackId}
          role={error ? "alert" : undefined}
          className={error ? "block text-sm text-danger" : "block text-xs text-ink-subtle"}
        >
          {error || hint}
        </span>
      )}
    </div>
  );
}
