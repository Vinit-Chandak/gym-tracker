"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { Input } from "@/components/ui/input";
import { SavedNotice } from "@/components/ui/saved-notice";
import { knownLoads, leastAssistance, stepHarder, type LoadLadder } from "@/domain/load-steps";
import { attempted } from "@/lib/offline-submit";
import { sanitizeNumberEntry } from "@/domain/sets";
import { confirmMachineLoadAction } from "@/server/actions/equipment";

/**
 * The step past the best weight ever lifted on a stack for this exercise, when nobody knows it
 * yet (ADR 0028, ADR 0048): today's heaviest or `best`, from every session before, whichever is
 * heavier. Asked from today's alone, a lighter day asked for a stop long since lifted past, or
 * asked nothing because the stop above today was known while the one above the best was not.
 *
 * `null` when there is nothing to ask: not a stack, nothing lifted, or the next stop is
 * already a known one. Otherwise the load it starts from and the app's guess — the gap
 * between the two heaviest stops, carried one further — or null when there is no gap yet.
 * On an assisted machine the step past the best is the one with less help, and at the least
 * help the machine gives there is none to ask for: the step after it is no help at all.
 */
export function nextLoadQuestion(
  ladder: LoadLadder | null | undefined,
  loads: readonly (number | null)[],
  best: number | null = null,
): { from: number; guess: number | null } | null {
  if (!ladder?.stack) return null;
  const lifted = knownLoads(
    loads.filter((load): load is number => load !== null),
    best === null ? [] : [best],
  );
  if (lifted.length === 0) return null;
  const from = ladder.assisted ? lifted[0]! : lifted.at(-1)!;
  const known = { ...ladder, known: knownLoads(ladder.known, lifted) };
  const next = stepHarder(known, from);
  if (next?.source === "known" || (!next && leastAssistance(known, from))) return null;
  return { from, guess: next?.load ?? null };
}

/**
 * One quiet line under the sets: the next weight on this machine, filled with the guess
 * where there is one, saved only when the athlete says so. Leaving it alone changes nothing.
 * While the box holds the guess, "From your logs" beside the label says so: a value the app
 * filled in says it in a word or two, never in a sentence under it (DESIGN.md, Need-to-Know).
 */
export function NextLoad({
  equipmentInstanceId,
  from,
  guess,
  unitLabel,
  assisted,
}: {
  equipmentInstanceId: string;
  from: number;
  guess: number | null;
  unitLabel: string;
  assisted: boolean;
}) {
  const [value, setValue] = useState(guess === null ? "" : String(guess));
  const [saved, setSaved] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = assisted
    ? `Next step down from ${from} ${unitLabel}`
    : `Next up from ${from} ${unitLabel}`;
  const inputId = `next-load-${equipmentInstanceId}`;
  const guessed = guess !== null && value === String(guess);
  const validLoad = (text: string) => {
    const load = Number(text);
    return Number.isFinite(load) && load > 0 && (assisted ? load < from : load > from);
  };

  if (saved !== null)
    return (
      <SavedNotice>
        Saved: {saved} {unitLabel} is on this machine.
      </SavedNotice>
    );

  const save = () => {
    const load = Number(value);
    if (!validLoad(value)) {
      setFieldError(true);
      setError(
        assisted
          ? `Enter a weight below ${from} ${unitLabel}.`
          : `Enter a weight above ${from} ${unitLabel}.`,
      );
      return;
    }
    startTransition(async () => {
      setError(null);
      setFieldError(false);
      const outcome = await attempted(
        () => confirmMachineLoadAction(equipmentInstanceId, load),
        "Could not save. Check your connection and try again.",
      );
      if (!outcome.ok) setError(outcome.message);
      else if (!outcome.value.ok) setError(outcome.value.error);
      else setSaved(load);
    });
  };

  return (
    <form
      className="space-y-1"
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
        <span className="flex flex-wrap items-baseline gap-x-1.5">
          <label
            htmlFor={inputId}
            className={
              fieldError ? "flex items-center gap-1.5 font-bold text-danger-text" : "text-ink-muted"
            }
          >
            {fieldError && <Glyph name="warn" className="glyph-16 text-danger-glyph" />}
            {label}
          </label>
          {guessed && (
            <span id={`${inputId}-from`} className="text-xs text-ink-subtle">
              From your logs
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(event) => {
              const next = sanitizeNumberEntry(event.target.value);
              setValue(next);
              if (fieldError && validLoad(next)) {
                setError(null);
                setFieldError(false);
              }
            }}
            className="w-20 text-right tabular-nums"
            aria-invalid={fieldError || undefined}
            aria-describedby={
              fieldError ? `${inputId}-error` : guessed ? `${inputId}-from` : undefined
            }
          />
          <span className="text-ink-muted">{unitLabel}</span>
          <Button type="submit" size="sm" variant="ghost" disabled={pending || value === ""}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
      {error && fieldError ? (
        <p
          id={`${inputId}-error`}
          role="alert"
          className="type-meta-small font-bold text-danger-text"
        >
          {error}
        </p>
      ) : error ? (
        <FormError message={error} />
      ) : null}
    </form>
  );
}
