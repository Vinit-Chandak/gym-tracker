"use client";

import type { Route } from "next";
import { useState, type ReactNode } from "react";

import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Glyph, type GlyphName } from "@/components/ui/glyphs";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Sheet } from "@/components/ui/sheet";
import { EFFORT_INPUT_VERSION } from "@/domain/effort";
import { sanitizeNumberEntry, stepValue } from "@/domain/sets";
import type { SetType } from "@/domain/types";
import { SET_TYPE_LABELS } from "@/lib/labels";
import { cn } from "@/lib/utils";
import { DRAFT_VALUE_FIELDS, type DraftValueField } from "@/lib/workout-drafts";

import type { EntryField } from "./entry";
import type { RowState } from "./use-set-rows";

// ---------- Why: the suggestion explained ----------

export type WhyContent = {
  tag: string;
  /** "62.5 kg × 3 @ 2", as figures with their units quieter. */
  figures: { load: string | null; unit: string; count: string | null; effort: string | null };
  reason: string | null;
  advice: string | null;
  basis: string | null;
  coachNote: string | null;
  /** Repeated comparable decline: the app's own warning, kept with the suggestion it bears on. */
  warning: string | null;
};

/** The tag a suggestion is named by: an outline, its word. */
export function SuggestionTag({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-[calc(12px+1.125rem)] shrink-0 items-center gap-[5px] rounded-tag border-[1.5px] border-ink px-[9px] text-[length:calc(2px+0.75rem)] leading-none font-bold",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Why (DESIGN.md, The log): a short sheet over logging, from the suggestion's tag. */
export function WhySheet({
  open,
  why,
  onClose,
  onHistory,
}: {
  open: boolean;
  why: WhyContent | null;
  onClose: () => void;
  onHistory: () => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Why this suggestion"
      lead={why ? <SuggestionTag>{why.tag}</SuggestionTag> : undefined}
    >
      {open && why && (
        <div>
          {(why.figures.load || why.figures.count) && (
            <p className="mt-3 type-figure-l whitespace-nowrap">
              {why.figures.load && (
                <>
                  {why.figures.load}{" "}
                  <span className="type-meta font-semibold text-ink-2">
                    {why.figures.unit}
                    {why.figures.count ? " ×" : ""}
                  </span>{" "}
                </>
              )}
              {why.figures.count}
              {why.figures.effort && (
                <>
                  {" "}
                  <span className="type-meta font-semibold text-ink-2">@</span> {why.figures.effort}
                </>
              )}
            </p>
          )}
          {why.reason && (
            <p className="mt-2 text-[length:calc(1px+1rem)] leading-[1.45] font-semibold">
              {why.reason}
            </p>
          )}
          {why.advice && <p className="mt-1.5 type-body">{why.advice}</p>}
          {why.coachNote && (
            <aside
              aria-label="From the coach"
              className="mt-3 rounded-control bg-surface px-3.5 py-3"
            >
              <p className="flex items-center gap-1.5 type-caption text-ink">
                <Glyph name="coach" className="glyph-16" />
                Coach
              </p>
              <p className="mt-1 type-body">{why.coachNote}</p>
            </aside>
          )}
          {why.warning && (
            <p className="mt-3 flex items-start gap-1.5 type-meta-small font-semibold">
              <Glyph name="warn" className="mt-0.5 glyph-16" />
              <span>{why.warning}</span>
            </p>
          )}
          {why.basis && <p className="mt-1.5 type-meta-small text-ink-2">{why.basis}</p>}
          <button
            type="button"
            onClick={onHistory}
            className="mt-2 flex min-h-[calc(52px+var(--ov-grow))] w-full items-center justify-between border-t border-hair text-left font-bold"
          >
            History
            <Glyph name="chevronRight" className="glyph-20" />
          </button>
        </div>
      )}
    </Sheet>
  );
}

// ---------- what an effort figure means ----------

export function EffortSheet({
  open,
  title,
  text,
  onClose,
}: {
  open: boolean;
  title: string;
  text: string;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      {open && <p className="mt-2 type-body">{text}</p>}
    </Sheet>
  );
}

// ---------- the set being entered: its type, another set, or none ----------

const SET_TYPES = Object.keys(SET_TYPE_LABELS) as SetType[];

export function SetOptionsSheet({
  row,
  title,
  canAdd,
  onType,
  onAdd,
  onRemove,
  onClose,
}: {
  row: RowState | null;
  title: string;
  canAdd: boolean;
  onType: (row: RowState, type: SetType) => void;
  onAdd: () => void;
  onRemove: (row: RowState) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={row !== null} onClose={onClose} title={title}>
      {row && (
        <div className="mt-2 space-y-4">
          <Field label="Type">
            <Select
              value={row.setType}
              disabled={row.saving}
              // A type change is not a value, so it marks nothing as edited: an untouched
              // load still takes its suggestion when the set is saved.
              onChange={(event) => onType(row, event.target.value as SetType)}
            >
              {SET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {SET_TYPE_LABELS[type]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-2">
            <Button
              variant="tonal"
              size="lg"
              disabled={!canAdd}
              onClick={() => {
                onAdd();
                onClose();
              }}
            >
              <Glyph name="plus" className="glyph-18" />
              Add set
            </Button>
            <Button
              variant="danger"
              size="lg"
              disabled={row.saving}
              onClick={() => {
                onRemove(row);
                onClose();
              }}
            >
              Remove this row
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

// ---------- a set done, opened from its line ----------

type Draft = Record<DraftValueField, string> & { setType: SetType; effortTouched: boolean };

function draftOf(row: RowState): Draft {
  return {
    weight: row.weight,
    reps: row.reps,
    rir: row.rir,
    rpe: row.rpe,
    duration: row.duration,
    distance: row.distance,
    setType: row.setType,
    effortTouched: false,
  };
}

/**
 * A logged set, to change or delete. The changes stay in the sheet until Update sends them,
 * so closing it leaves the set as the server has it; a change that did not reach the server
 * stays with the set, under its line, to retry or discard.
 */
export function SetEditSheet({
  row,
  title,
  fields,
  onUpdate,
  onDelete,
  onDiscard,
  onClose,
}: {
  row: RowState | null;
  title: string;
  /** Load, the count and effort: the same three the entry has. */
  fields: readonly EntryField[];
  onUpdate: (row: RowState) => void;
  onDelete: (row: RowState) => void;
  onDiscard: (row: RowState) => void;
  onClose: () => void;
}) {
  return (
    <Sheet open={row !== null} onClose={onClose} title={title}>
      {row && (
        <SetEditor
          key={`${row.setIndex}:${row.logged?.completedAt ?? ""}`}
          row={row}
          fields={fields}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onDiscard={onDiscard}
          onClose={onClose}
        />
      )}
    </Sheet>
  );
}

function SetEditor({
  row,
  fields,
  onUpdate,
  onDelete,
  onDiscard,
  onClose,
}: {
  row: RowState;
  fields: readonly EntryField[];
  onUpdate: (row: RowState) => void;
  onDelete: (row: RowState) => void;
  onDiscard: (row: RowState) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(row));
  const original = draftOf(row);
  const changed =
    draft.setType !== original.setType ||
    DRAFT_VALUE_FIELDS.some((field) => draft[field] !== original[field]);
  const failed = row.dirty && row.error !== null;

  const set = (field: DraftValueField, value: string, effort: boolean) =>
    setDraft((current) => ({
      ...current,
      [field]: value,
      effortTouched: current.effortTouched || effort,
    }));

  const update = () =>
    onUpdate({
      ...row,
      ...draft,
      // A type picked by hand is the athlete's word on what the set is.
      ...(draft.setType !== row.setType ? { typeChosen: true, autoWarmup: false } : {}),
      touched: new Set(DRAFT_VALUE_FIELDS),
      effortVersion: draft.effortTouched ? EFFORT_INPUT_VERSION : row.effortVersion,
      dirty: true,
    });

  return (
    <div className="mt-2 space-y-4">
      <Field label="Type">
        <Select
          value={draft.setType}
          disabled={row.saving}
          onChange={(event) =>
            setDraft((current) => ({ ...current, setType: event.target.value as SetType }))
          }
        >
          {SET_TYPES.map((type) => (
            <option key={type} value={type}>
              {SET_TYPE_LABELS[type]}
            </option>
          ))}
        </Select>
      </Field>
      <div>
        {fields.map((field) => {
          const effort = field.info !== null;
          const value = draft[field.field];
          return (
            <div
              key={field.field}
              className="flex items-center justify-between gap-3 border-b border-hair py-2.5"
            >
              <span className="flex min-w-0 flex-col">
                <span className="type-heading text-[length:var(--ov-type-body)] [overflow-wrap:anywhere]">
                  {field.inputLabel}
                </span>
                {field.hint && (
                  <span className="text-[length:var(--ov-type-caption)] font-medium text-ink-2 tabular-nums">
                    {field.hint}
                  </span>
                )}
              </span>
              <span className="flex shrink-0 items-center">
                <button
                  type="button"
                  className="round-button"
                  aria-label={field.less}
                  disabled={row.saving}
                  onClick={() =>
                    set(
                      field.field,
                      String(
                        Math.min(
                          field.max,
                          Number(
                            stepValue(value, -field.step, effort ? field.target : null, field.min),
                          ),
                        ),
                      ),
                      effort,
                    )
                  }
                >
                  <Glyph name="minus" className="glyph-20" />
                </button>
                <span className="flex w-[calc(60px+3.75rem)] items-baseline justify-center gap-[3px]">
                  <Input
                    type="text"
                    inputMode={field.inputMode}
                    aria-label={field.inputLabel}
                    value={value}
                    placeholder="–"
                    disabled={row.saving}
                    onChange={(event) =>
                      set(
                        field.field,
                        sanitizeNumberEntry(event.target.value, field.inputMode, field.max),
                        effort,
                      )
                    }
                    className="min-h-0 w-[3.6ch] border-0 border-b-[2.5px] border-transparent bg-transparent p-0 pb-[3px] text-center type-figure-l focus:border-ink"
                  />
                  {!effort && (
                    <span className="text-[length:var(--ov-type-caption)] font-semibold text-ink-2">
                      {field.unit}
                    </span>
                  )}
                </span>
                <button
                  type="button"
                  className="round-button"
                  aria-label={field.more}
                  disabled={row.saving}
                  onClick={() =>
                    set(
                      field.field,
                      String(
                        Math.min(
                          field.max,
                          Number(
                            stepValue(value, field.step, effort ? field.target : null, field.min),
                          ),
                        ),
                      ),
                      effort,
                    )
                  }
                >
                  <Glyph name="plus" className="glyph-20" />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {row.error && (
        <p
          role="alert"
          className="flex items-start gap-2 text-[length:var(--ov-type-meta)] leading-[1.4] font-semibold"
        >
          <Glyph name="warn" className="mt-px glyph-18" />
          <span className="min-w-0 [overflow-wrap:anywhere]">{row.error}</span>
        </p>
      )}
      <div className="grid gap-2">
        <Button size="lg" disabled={row.saving || (!changed && !failed)} onClick={update}>
          {row.saving ? "Saving…" : failed && !changed ? "Retry" : "Update"}
        </Button>
        {row.dirty && !row.saving && (
          <Button
            variant="text"
            size="lg"
            onClick={() => {
              onDiscard(row);
              onClose();
            }}
          >
            Discard this local draft
          </Button>
        )}
        <Button
          variant="danger"
          size="lg"
          disabled={row.saving}
          onClick={() => {
            onDelete(row);
            onClose();
          }}
        >
          <Glyph name="trash" className="glyph-18" />
          Delete this set
        </Button>
      </div>
    </div>
  );
}

// ---------- More: complete, superset, a fallback, skip ----------

export type MoreOption = {
  glyph: GlyphName;
  label: string;
  /** A destination, or something done here. */
  href?: Route;
  onSelect?: () => void;
  disabled?: boolean;
  /** Stands apart from the rest, under a rule: it drops the exercise. */
  apart?: boolean;
};

export function MoreSheet({
  open,
  options,
  onClose,
}: {
  open: boolean;
  options: readonly MoreOption[];
  onClose: () => void;
}) {
  const row = (option: MoreOption) => {
    const inner = (
      <>
        <span className="grid w-5 shrink-0 place-items-center">
          <Glyph name={option.glyph} className="glyph-22" />
        </span>
        <span
          className={cn(
            "min-w-0 flex-1 text-[length:var(--ov-type-button)] [overflow-wrap:anywhere]",
            option.apart ? "font-bold" : "font-semibold",
          )}
        >
          {option.label}
        </span>
        <Glyph name="chevronRight" className="glyph-20 text-ink-2" />
      </>
    );
    const className =
      "flex min-h-[calc(56px+var(--ov-grow))] w-full items-center gap-3 text-left disabled:text-ink-2";
    return option.href ? (
      <Link href={option.href} className={className} onClick={onClose}>
        {inner}
      </Link>
    ) : (
      <button
        type="button"
        className={className}
        disabled={option.disabled}
        onClick={() => {
          onClose();
          option.onSelect?.();
        }}
      >
        {inner}
      </button>
    );
  };
  const together = options.filter((option) => !option.apart);
  const apart = options.filter((option) => option.apart);
  return (
    <Sheet open={open} onClose={onClose} title="More options">
      {open && (
        <ul className="mt-1">
          {together.map((option, index) => (
            <li
              key={option.label}
              className={cn(index < together.length - 1 && "border-b border-hair")}
            >
              {row(option)}
            </li>
          ))}
          {apart.map((option) => (
            <li key={option.label} className="mt-3.5 border-t border-hair pt-1.5">
              {row(option)}
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

// ---------- skipping an exercise ----------

export function SkipSheet({
  open,
  name,
  pending,
  onSkip,
  onClose,
}: {
  open: boolean;
  name: string;
  pending: boolean;
  onSkip: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Sheet open={open} onClose={onClose} title={`Skip ${name}?`}>
      {open && (
        <div className="mt-2 space-y-3">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reason (optional)"
            maxLength={200}
            aria-label="Skip reason"
          />
          <Button
            variant="danger"
            size="lg"
            className="w-full"
            onClick={() => onSkip(reason)}
            disabled={pending}
          >
            <Glyph name="skip" className="glyph-18" />
            Skip exercise
          </Button>
        </div>
      )}
    </Sheet>
  );
}
