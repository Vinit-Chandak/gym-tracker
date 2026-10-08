"use client";

import { useId, type CSSProperties, type ReactNode } from "react";

import { FigureInput } from "@/components/ui/figure-input";
import { emWidth, onRamp, rampSize } from "@/components/ui/fit";
import { Glyph } from "@/components/ui/glyphs";
import { Swap } from "@/components/ui/swap";
import { sanitizeNumberEntry, stepValue } from "@/domain/sets";
import type { PrescriptionType } from "@/domain/types";
import { cn } from "@/lib/utils";
import type { DraftValueField } from "@/lib/workout-drafts";

import { headingText, type EntryHeading } from "./logger-model";
import type { Ghost, RowState } from "./use-set-rows";

/** The figure a stepper shows, and how: suggested until touched, then ink; empty is a dash. */
type FigureState = "suggested" | "touched" | "empty";

export type EntryField = {
  field: DraftValueField;
  /** Under the figure: kg, reps, m, RIR. */
  unit: string;
  /** Under the unit, on a line of its own: "target 2", "optional", "1–10". */
  hint: string | null;
  /** Said under the unit only when the entry folds (200%): the range the meta line gave. */
  foldHint: string | null;
  /** The field's name while it is typed into. */
  inputLabel: string;
  inputMode: "decimal" | "numeric";
  max: number;
  min: number;
  step: number;
  /** What − and + say. */
  less: string;
  more: string;
  /** What the figure says, and what a tap does. */
  name: (value: string, state: FigureState) => string;
  /** An empty effort's dash takes this target. */
  target: number | null;
  /** RIR and RPE carry ⓘ beside their unit. */
  info: string | null;
};

type EntryProps = {
  row: RowState;
  heading: EntryHeading;
  ghost: Ghost;
  measure: PrescriptionType;
  fields: readonly [EntryField, EntryField, EntryField];
  /** The entry's figure size on the ramp, before the reader's text size. */
  size: number;
  /** The suggestion's tag, which opens Why. */
  tag: { label: string; name: string; onOpen: () => void } | null;
  /** Which figure is being typed into, if any. */
  typing: DraftValueField | null;
  /** Rendered figure size in px and the control target, for the operators' line. */
  metrics: { figure: number; target: number };
  /** The dash of an effort Save waits for inks after a tap on Save. */
  alert: boolean;
  onEdit: (patch: Partial<RowState>, touch: DraftValueField) => void;
  onType: (field: DraftValueField) => void;
  onTypingEnd: () => void;
  onOptions: () => void;
  onInfo: (field: EntryField) => void;
  /** The one message slot, at the head of the entry: a message never moves a stepper or Save. */
  slot: ReactNode;
  /** Save, and what is said about it only to a screen reader. */
  children: ReactNode;
};

export const inputId = (base: string, field: DraftValueField) => `${base}-${field}`;

/**
 * The entry, docked at the foot (DESIGN.md, Logging and Steppers): the one message slot under
 * its rule, the set and its tag, then load, reps and RIR on the log's grid with the operators
 * between, so it reads as the notation it records, then Save. The entry grows upwards from Save,
 * so a message that comes or goes moves nothing a thumb is reaching for. Each figure is a button:
 * a tap types it, and the empty effort's dash takes its target. − and + sit under a figure while
 * its column holds both; narrower, + stands over it and − under it (session.css decides, by the
 * layer's width).
 */
export function Entry({
  row,
  heading,
  ghost,
  measure,
  fields,
  size,
  tag,
  typing,
  metrics,
  alert,
  onEdit,
  onType,
  onTypingEnd,
  onOptions,
  onInfo,
  slot,
  children,
}: EntryProps) {
  const base = useId();
  const title = headingText(heading);
  const swapId = String(row.setIndex);
  // The operators stand on the figures' line, their tops set so they sit by its baseline.
  const opTop =
    Math.max(0, (metrics.target - metrics.figure * 1.1) / 2) + Math.round(metrics.figure * 0.32);
  const style = {
    "--entry-size": rampSize(size, 0.5),
    "--entry-op": rampSize(onRamp(size * 0.5), 0.5),
    "--entry-op-top": `${opTop}px`,
  } as CSSProperties;

  const shown = (field: EntryField): { value: string; state: FigureState } => {
    const own = row[field.field];
    if (row.touched.has(field.field))
      return own.trim() === "" ? { value: "", state: "empty" } : { value: own, state: "touched" };
    // Load and reps take the suggestion until touched; effort is never prefilled.
    const suggested = field.info === null ? ghost[field.field] : undefined;
    return suggested ? { value: suggested, state: "suggested" } : { value: "", state: "empty" };
  };

  const step = (field: EntryField, direction: 1 | -1) => {
    const { value } = shown(field);
    const from = field.info !== null ? field.target : null;
    const next = Math.min(
      field.max,
      Number(stepValue(value, field.step * direction, from, field.min)),
    );
    onEdit({ [field.field]: String(next) }, field.field);
  };

  const press = (field: EntryField) => {
    const { state } = shown(field);
    // The empty effort's dash takes its target; anything else is typed.
    if (state === "empty" && field.info !== null && field.target !== null) {
      onEdit({ [field.field]: String(field.target) }, field.field);
      return;
    }
    onType(field.field);
    // The inputs are up now (onType renders them at once), so the focus can move inside the
    // tap, which is what brings the keyboard up on iOS.
    document.getElementById(inputId(base, field.field))?.focus();
  };

  const stepper = (field: EntryField, key: string) => {
    const { value, state } = shown(field);
    const effort = field.info !== null;
    const typed = typing !== null;
    const figure = (
      <span
        className={cn(
          state === "suggested" && "figure-suggested",
          state === "empty" && "figure-empty",
        )}
        data-alert={effort && state === "empty" && alert ? true : undefined}
      >
        {state === "empty" ? "–" : value}
      </span>
    );
    return (
      <div key={key} role="group" aria-label={field.unit} className="stepper" data-field={key}>
        {typed ? (
          <span className="stepper-figure">
            <FigureInput
              id={inputId(base, field.field)}
              maxLength={24}
              inputMode={field.inputMode}
              enterKeyHint="done"
              aria-label={field.inputLabel}
              value={state === "empty" ? "" : value}
              placeholder="–"
              disabled={row.saving}
              className={cn(state === "suggested" && "figure-suggested")}
              style={{ width: `${Math.max(0.9, emWidth(value || "0")) + 0.08}em` }}
              onChange={(event) =>
                onEdit(
                  {
                    [field.field]: sanitizeNumberEntry(
                      event.target.value,
                      field.inputMode,
                      field.max,
                    ),
                  },
                  field.field,
                )
              }
              onKeyDown={(event) => {
                if (event.key === "Escape" || event.key === "Enter") onTypingEnd();
              }}
            />
          </span>
        ) : (
          <button
            type="button"
            className="stepper-figure"
            aria-label={field.name(value, state)}
            disabled={row.saving}
            onClick={() => press(field)}
          >
            <Swap id={swapId}>{figure}</Swap>
          </button>
        )}
        <span className="stepper-units">
          <span className="stepper-units-line">
            {field.unit}
            {effort && !typed && (
              <button
                type="button"
                aria-haspopup="dialog"
                aria-label={field.info!}
                className="entry-info"
                onClick={() => onInfo(field)}
              >
                <Glyph name="info" className="glyph-16" />
              </button>
            )}
          </span>
          {field.hint && <span className="stepper-hint">{field.hint}</span>}
          {field.foldHint && (
            <span className="stepper-hint stepper-hint-fold">{field.foldHint}</span>
          )}
        </span>
        <button
          type="button"
          className="round-button stepper-minus"
          aria-label={field.less}
          disabled={row.saving}
          onClick={() => step(field, -1)}
        >
          <Glyph name="minus" className="glyph-20" />
        </button>
        <button
          type="button"
          className="round-button stepper-plus"
          aria-label={field.more}
          disabled={row.saving}
          onClick={() => step(field, 1)}
        >
          <Glyph name="plus" className="glyph-20" />
        </button>
      </div>
    );
  };

  const [load, count, effort] = fields;
  const effortOperator = measure === "reps" ? "@" : "·";

  return (
    <section aria-label={title} className="entry" style={style}>
      {slot}
      <div className="entry-head">
        <div className="entry-title">
          {/* Under the exercise's name, the logger's h1: the set is the next level. */}
          <h2 className="type-heading tabular-nums">
            <Swap id={swapId}>
              {heading.kind === "warmup" ? "Warm-up" : "Set"} {heading.n}
              {heading.of !== null && <span className="text-ink-2"> of {heading.of}</span>}
            </Swap>
          </h2>
          {/* Warm-up or work, the tag stands wherever the set has a suggestion of its own. */}
          {tag && (
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={tag.name}
              className="entry-tag"
              onClick={tag.onOpen}
            >
              <span>
                {tag.label}
                <Glyph name="info" className="glyph-16" />
              </span>
            </button>
          )}
        </div>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label="Set options: add a set, type, remove"
          className="entry-options"
          onClick={onOptions}
        >
          <Glyph name="sliders" className="glyph-20" />
        </button>
      </div>
      <div
        className="entry-figures"
        onBlur={(event) => {
          // Typing ends when the focus leaves the entry: Done on the keyboard, a tap elsewhere.
          // A tap on Save keeps the figures up until Save has run.
          const next = event.relatedTarget as Node | null;
          if (typing !== null && !event.currentTarget.closest(".entry")?.contains(next))
            onTypingEnd();
        }}
      >
        <span aria-hidden className="entry-number" />
        {stepper(load, "load")}
        <span aria-hidden className="entry-op" data-op="times">
          ×
        </span>
        {stepper(count, "count")}
        <span aria-hidden className="entry-op" data-op="effort">
          {effortOperator}
        </span>
        {stepper(effort, "effort")}
      </div>
      <div className="entry-save">{children}</div>
    </section>
  );
}
