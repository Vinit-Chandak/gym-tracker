"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { removeSupersetAction, saveSupersetAction } from "@/server/actions/sessions";

import type { ExerciseVM } from "./view-model";

type SupersetSheetProps = {
  sessionId: string;
  exercises: readonly ExerciseVM[];
  /** The group being edited, or null when creating a new one. */
  group: string | null;
  onClose: () => void;
  onChanged: () => void;
};

/**
 * Grouping for this workout only.
 *
 * It writes a label on the workout's own exercises. The programme template is never
 * touched, so today's pairing does not become next week's plan, and no recorded set is
 * moved or reassigned by grouping or ungrouping.
 */
export function SupersetSheet({
  sessionId,
  exercises,
  group,
  onClose,
  onChanged,
}: SupersetSheetProps) {
  // The caller mounts this per group, so the selection starts from that group's members
  // without an effect reaching in to reset it afterwards.
  const [selected, setSelected] = useState<string[]>(() =>
    group === null ? [] : exercises.filter((e) => e.supersetGroup === group).map((e) => e.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const save = () =>
    startTransition(async () => {
      setError(null);
      try {
        const result = await saveSupersetAction(sessionId, {
          group,
          workoutExerciseIds: selected,
        });
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } catch {
        setError("Could not save the superset. Check your connection and try again.");
        return;
      }
      onChanged();
      onClose();
    });

  const ungroup = () =>
    startTransition(async () => {
      if (group === null) return;
      setError(null);
      try {
        const result = await removeSupersetAction(sessionId, group);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      } catch {
        setError("Could not remove the superset. Check your connection and try again.");
        return;
      }
      onChanged();
      onClose();
    });

  return (
    <Sheet open onClose={onClose} title={group ?? "New superset"}>
      <div className="space-y-3">
        <p className="text-sm text-ink-muted">
          Groups these exercises for this workout only. Your programme is unchanged, and every set
          you have already logged stays where it is.
        </p>

        <ul className="border-y border-line ruled-list">
          {exercises.map((exercise) => {
            const checked = selected.includes(exercise.id);
            const elsewhere =
              exercise.supersetGroup !== null && exercise.supersetGroup !== group && !checked;
            return (
              <li key={exercise.id}>
                <label
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 py-2",
                    pending && "opacity-60",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={pending}
                    onChange={() => toggle(exercise.id)}
                    className="size-5 shrink-0 accent-[var(--ov-accent)]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm [overflow-wrap:anywhere]">
                      {exercise.exercise.name}
                    </span>
                    {elsewhere && (
                      <span className="block text-xs text-ink-subtle">
                        Currently in {exercise.supersetGroup}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}

        <Button
          size="lg"
          className="w-full"
          onClick={save}
          disabled={pending || selected.length < 2}
        >
          {pending ? "Saving…" : group ? "Save changes" : "Create superset"}
        </Button>
        {selected.length < 2 && (
          <p className="text-xs text-ink-subtle">Choose at least two exercises.</p>
        )}
        {group && (
          <Button variant="danger" className="w-full" onClick={ungroup} disabled={pending}>
            Ungroup
          </Button>
        )}
      </div>
    </Sheet>
  );
}
