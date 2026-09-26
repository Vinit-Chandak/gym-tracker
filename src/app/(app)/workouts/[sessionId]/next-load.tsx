"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { knownLoads, stepHarder, type LoadLadder } from "@/domain/load-steps";
import { attempted } from "@/lib/offline-submit";
import { sanitizeNumberEntry } from "@/domain/sets";
import { confirmMachineLoadAction } from "@/server/actions/equipment";

/**
 * The step past today's heaviest weight on a stack, when nobody knows it yet (ADR 0028).
 *
 * `null` when there is nothing to ask: not a stack, nothing lifted, or the next stop is
 * already a known one. Otherwise the load it starts from and the app's guess — the gap
 * between the two heaviest stops, carried one further — or null when there is no gap yet.
 * On an assisted machine the step past today is the one with less help.
 */
export function nextLoadQuestion(
  ladder: LoadLadder | null | undefined,
  loads: readonly (number | null)[],
): { from: number; guess: number | null } | null {
  if (!ladder?.stack) return null;
  const lifted = knownLoads(loads.filter((load): load is number => load !== null));
  if (lifted.length === 0) return null;
  const from = ladder.assisted ? lifted[0]! : lifted.at(-1)!;
  const next = stepHarder({ ...ladder, known: knownLoads(ladder.known, lifted) }, from);
  if (next?.source === "known") return null;
  return { from, guess: next?.load ?? null };
}

/**
 * One quiet line under the sets: the next weight on this machine, filled with the guess
 * where there is one, saved only when the athlete says so. Leaving it alone changes nothing.
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
  const [pending, startTransition] = useTransition();
  const label = assisted
    ? `Next step down from ${from} ${unitLabel}`
    : `Next up from ${from} ${unitLabel}`;
  const inputId = `next-load-${equipmentInstanceId}`;

  if (saved !== null)
    return (
      <p role="status" className="text-sm text-ink-muted">
        Saved: {saved} {unitLabel} is on this machine.
      </p>
    );

  const save = () => {
    const load = Number(value);
    if (!(load > 0) || (assisted ? load >= from : load <= from)) {
      setError(
        assisted
          ? `Enter a weight below ${from} ${unitLabel}.`
          : `Enter a weight above ${from} ${unitLabel}.`,
      );
      return;
    }
    startTransition(async () => {
      setError(null);
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
        <label htmlFor={inputId} className="text-ink-muted">
          {label}
        </label>
        <div className="flex items-center gap-2">
          <Input
            id={inputId}
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(event) => setValue(sanitizeNumberEntry(event.target.value))}
            className="w-20 text-right tabular-nums"
            aria-describedby={guess !== null ? `${inputId}-hint` : undefined}
          />
          <span className="text-ink-muted">{unitLabel}</span>
          <Button type="submit" size="sm" variant="ghost" disabled={pending || value === ""}>
            Save
          </Button>
        </div>
      </div>
      {guess !== null && (
        <p id={`${inputId}-hint`} className="text-xs text-ink-subtle">
          A guess from your logs. Correct it if the stack says otherwise.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
