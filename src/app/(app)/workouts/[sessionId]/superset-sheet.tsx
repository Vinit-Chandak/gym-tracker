"use client";

import { ChevronRight } from "@/components/ui/icons";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { InfoTip } from "@/components/ui/info-tip";
import { Sheet } from "@/components/ui/sheet";
import { supersetHues, supersetStyle } from "@/lib/superset-colors";
import { cn } from "@/lib/utils";
import { removeSupersetAction, saveSupersetAction } from "@/server/actions/sessions";

import type { ExerciseVM } from "./view-model";

type SupersetSheetProps = {
  sessionId: string;
  exercises: readonly ExerciseVM[];
  /** The group being edited, or null when creating a new one. */
  group: string | null;
  /** Switches to editing an existing group; the caller remounts the sheet for it. */
  onEditGroup: (group: string) => void;
  onClose: () => void;
};

/**
 * Grouping for this workout only.
 *
 * It writes a label on the workout's own exercises. The programme template is never
 * touched, so today's pairing does not become next week's plan, and no recorded set is
 * moved or reassigned by grouping or ungrouping.
 *
 * The list rows carry no group caption, so this is also where an existing group is found
 * again: opening the sheet fresh lists the workout's groups by colour before the picker.
 */
export function SupersetSheet({
  sessionId,
  exercises,
  group,
  onEditGroup,
  onClose,
}: SupersetSheetProps) {
  // The caller mounts this per group, so the selection starts from that group's members
  // without an effect reaching in to reset it afterwards.
  const [selected, setSelected] = useState<string[]>(() =>
    group === null ? [] : exercises.filter((e) => e.supersetGroup === group).map((e) => e.id),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const hues = supersetHues(exercises);
  const existing = [...hues.keys()].map((name) => ({
    name,
    hue: hues.get(name)!,
    members: exercises.filter((e) => e.supersetGroup === name).map((e) => e.exercise.name),
  }));

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
      onClose();
    });

  return (
    <Sheet open onClose={onClose} title={group ? "Edit superset" : "Superset"}>
      <div className="space-y-3">
        <p className="flex items-center gap-1 text-sm text-ink-muted">
          This workout only
          <InfoTip label="About supersets">
            Grouped exercises are done back to back. The grouping belongs to this workout: the
            programme is unchanged, and logged sets stay where they are.
          </InfoTip>
        </p>

        {group === null && existing.length > 0 && (
          <ul className="ruled-list">
            {existing.map((entry) => (
              <li key={entry.name}>
                <button
                  type="button"
                  onClick={() => onEditGroup(entry.name)}
                  className="flex min-h-12 w-full items-center gap-3 py-2 pl-2 text-left text-sm superset-row active:bg-surface-raised"
                  style={supersetStyle(entry.hue)}
                >
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    {entry.members.join(" + ")}
                  </span>
                  <span className="shrink-0 text-xs font-medium text-ink-muted">Edit</span>
                  <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}

        <ul className="ruled-list">
          {exercises.map((exercise) => {
            const checked = selected.includes(exercise.id);
            const elsewhere =
              exercise.supersetGroup !== null && exercise.supersetGroup !== group && !checked;
            const hue =
              elsewhere && exercise.supersetGroup ? hues.get(exercise.supersetGroup) : null;
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
                  <span className="min-w-0 flex-1 text-sm [overflow-wrap:anywhere]">
                    {exercise.exercise.name}
                  </span>
                  {/* Already in another group: its colour says which, no words needed. */}
                  {hue && (
                    <span
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: `var(--ov-group-${hue})` }}
                      aria-label="In another superset"
                    />
                  )}
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
