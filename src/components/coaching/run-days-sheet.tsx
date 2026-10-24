"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { FormError } from "@/components/ui/form";
import { Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { ProgramBlueprint } from "@/domain/program-blueprint";
import { moveRunDays, planRunDays, type DayHolds } from "@/domain/run-days";
import { WEEKDAY_NAMES } from "@/lib/labels";
import { Sheet } from "@/components/ui/sheet";

const HOLDS: Record<DayHolds, string> = {
  long: "Long runs",
  hard: "Hard sessions",
  easy: "Easy runs",
};

/**
 * Run days, moved at once on a programme the coach dated (ADR 0063): each day it runs on, with
 * what that day mostly holds, given a new one. Every week's sessions on it move to that day of
 * their own week; the race stays on race day. What moving leaves (a session that could not
 * move, two hard days back to back) is said before it is saved.
 */
export function RunDaysSheet({
  open,
  onClose,
  blueprint,
  busy,
  error,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  blueprint: ProgramBlueprint;
  busy: boolean;
  error: string | null;
  onSave: (blueprint: ProgramBlueprint) => void;
}) {
  const days = planRunDays(blueprint);
  const [moves, setMoves] = useState<Record<number, number>>(() =>
    Object.fromEntries(days.map((entry) => [entry.day, entry.day])),
  );
  const chosen = days.map((entry) => moves[entry.day] ?? entry.day);
  const clash = new Set(chosen).size !== chosen.length;
  const result = clash ? null : moveRunDays(blueprint, moves);
  const sessions = (count: number) => `${count} ${count === 1 ? "session" : "sessions"}`;
  const consequences = result
    ? [
        result.stayed > 0
          ? `${sessions(result.stayed)} cannot move and ${result.stayed === 1 ? "stays" : "stay"} where ${result.stayed === 1 ? "it is" : "they are"}.`
          : null,
        result.backToBack > 0
          ? `Puts hard days back to back ${result.backToBack === 1 ? "once" : `${result.backToBack} times`}.`
          : null,
      ].filter((line): line is string => line !== null)
    : [];
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Run days"
      dismissible={!busy}
      footer={
        <div className="space-y-2">
          <FormError
            message={clash ? "Give each run day its own new day." : (error ?? undefined)}
          />
          {consequences.map((line) => (
            <p key={line} className="text-[length:var(--ov-type-caption)] font-medium text-ink-2">
              {line}
            </p>
          ))}
          <Button
            size="lg"
            className="w-full"
            disabled={busy || !result || result.moved === 0}
            onClick={() => result && onSave(result.blueprint)}
          >
            {busy
              ? "Saving…"
              : result && result.moved > 0
                ? `Move ${sessions(result.moved)}`
                : "Move runs"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {days.map((entry) => (
          <Field key={entry.day} label={WEEKDAY_NAMES[entry.day]!} aside={HOLDS[entry.holds]}>
            <Select
              value={String(moves[entry.day] ?? entry.day)}
              onChange={(event) =>
                setMoves((current) => ({ ...current, [entry.day]: Number(event.target.value) }))
              }
            >
              {[1, 2, 3, 4, 5, 6, 7].map((day) => (
                <option key={day} value={day}>
                  {WEEKDAY_NAMES[day]}
                </option>
              ))}
            </Select>
          </Field>
        ))}
      </div>
    </Sheet>
  );
}
