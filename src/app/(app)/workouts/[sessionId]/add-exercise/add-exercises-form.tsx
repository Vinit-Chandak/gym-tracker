"use client";

import { Fragment, useActionState, useState } from "react";

import { ExercisePicker } from "@/components/exercise-picker";
import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { SelectRow } from "@/components/ui/select-row";
import { Sheet } from "@/components/ui/sheet";
import { Swap } from "@/components/ui/swap";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import type { ExerciseListItem } from "@/server/repositories/exercises";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

type Machine = { id: string; name: string };

/** The most one submission adds; the server holds the same limit. */
export const MAX_SELECTED = 20;

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  exercises: ExerciseListItem[];
  /** The gym's active machines. */
  machines: Machine[];
  /** The gym's machines each exercise can actually be done on, keyed by exercise id. */
  machinesByExercise: Record<string, string[]>;
  /** The machine the athlete set for an exercise at this gym ("use this machine"), if any. */
  preferredMachines: Record<string, string>;
  /** Exercises already in the workout: shown as such, and still addable again. */
  inWorkout: string[];
};

/** Where an exercise will be done, as far as the form can tell without asking. */
type Placement =
  | { kind: "machine"; machine: Machine }
  | { kind: "choose"; options: Machine[]; preferred: string | null }
  | { kind: "none"; needsMachine: boolean };

type Review = { mode: "questions"; ids: string[] } | { mode: "all" } | null;

const NOT_CHOSEN = "Machine not chosen";

/**
 * Adding exercises to the workout, several at once (plan: "Add several exercises in one
 * submission"; board Add exercise). The search and its results, every row a checkbox; the
 * selection is kept here, in the order it was made, so it survives each search and every
 * failed save. Pinned at the foot: what the selection adds up to, which opens it to review, and
 * Add, which adds it straight away unless a machine question is open. The questions are asked
 * only when several machines here can do an exercise; one is named, none is said.
 *
 * The submission key is minted once per visit and kept for retries, so a save whose reply was
 * lost adds nothing twice; leaving the page drops it, and the next visit starts a new one.
 */
export function AddExercisesForm({
  action,
  exercises,
  machines,
  machinesByExercise,
  preferredMachines,
  inWorkout,
}: Props) {
  const form = useKeptForm();
  // Minted as the form mounts in the browser and never rendered, so the server's render has no
  // key of its own to disagree with; every try from this form sends the same one.
  const [submissionKey] = useState(() => crypto.randomUUID());
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(async (previous: FormState, formData: FormData) => {
      formData.set("submissionKey", submissionKey);
      return action(previous, formData);
    }),
    INITIAL_FORM_STATE,
  );
  const [selected, setSelected] = useState<string[]>([]);
  // A machine the athlete chose for an exercise; "" is Machine not chosen, said on purpose.
  const [choices, setChoices] = useState<Record<string, string>>({});
  // The exercises whose machine question has been put, so Add does not put it again.
  const [asked, setAsked] = useState<ReadonlySet<string>>(() => new Set());
  const [review, setReview] = useState<Review>(null);
  const [notice, setNotice] = useState("");

  const byId = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const already = new Set(inWorkout);
  const count = selected.length;

  const placement = (exercise: ExerciseListItem): Placement => {
    const ids = machinesByExercise[exercise.id] ?? [];
    const options = machines.filter((machine) => ids.includes(machine.id));
    if (options.length === 1) return { kind: "machine", machine: options[0]! };
    if (options.length > 1) {
      const preferred = preferredMachines[exercise.id] ?? null;
      return {
        kind: "choose",
        options,
        preferred: preferred && ids.includes(preferred) ? preferred : null,
      };
    }
    return { kind: "none", needsMachine: exercise.requiresEquipment };
  };

  /** The machine sent for an exercise: the athlete's choice, else the one the form can name. */
  const machineFor = (exercise: ExerciseListItem): string => {
    const place = placement(exercise);
    if (place.kind === "machine") return place.machine.id;
    if (place.kind === "none") return "";
    return choices[exercise.id] ?? place.preferred ?? "";
  };

  /** A machine question nobody has put yet: several machines, and no choice made or kept. */
  const openQuestion = (id: string) => {
    const exercise = byId.get(id);
    if (!exercise || asked.has(id) || choices[id] !== undefined) return false;
    const place = placement(exercise);
    return place.kind === "choose" && place.preferred === null;
  };

  const toggle = (id: string) => {
    if (selected.includes(id)) {
      setSelected((current) => current.filter((value) => value !== id));
      setNotice(`${count - 1} selected`);
      return;
    }
    if (count >= MAX_SELECTED) {
      setNotice(`${MAX_SELECTED} is the most you can add at once.`);
      return;
    }
    setSelected((current) => [...current, id]);
    setNotice(`${count + 1} selected`);
  };

  const remove = (id: string) => {
    const left = selected.filter((value) => value !== id);
    setSelected(left);
    setNotice(`${left.length} selected`);
    if (left.length === 0) setReview(null);
  };

  const shown =
    review === null
      ? []
      : review.mode === "all"
        ? selected
        : review.ids.filter((id) => selected.includes(id));

  const word = count === 1 ? "exercise" : "exercises";
  // One run of text, so the count sits a word-space from Add, and a screen reader hears what
  // is being added: "Add 3 exercises".
  const addLabel =
    count === 0 ? (
      "Add to session"
    ) : (
      <span>
        Add <Swap id={String(count)}>{count}</Swap> <span className="sr-only">{word}</span>
      </span>
    );

  return (
    // Kept through React's reset after the action: the checkboxes and the machine choices show
    // this form's state, which a failed save keeps.
    <form ref={form} action={formAction}>
      {selected.map((id) => {
        const exercise = byId.get(id);
        if (!exercise) return null;
        return (
          <Fragment key={id}>
            <input type="hidden" name="exerciseId" value={id} />
            <input type="hidden" name="equipmentInstanceId" value={machineFor(exercise)} />
          </Fragment>
        );
      })}

      <ExercisePicker
        mode="multiple"
        exercises={exercises}
        selected={selected}
        onToggle={toggle}
        note={(exercise) => (already.has(exercise.id) ? "In this workout" : null)}
      />

      <p role="status" className="sr-only">
        {notice}
      </p>

      <PinnedActions stack>
        {count > 0 && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label={`Review ${count} selected ${word}`}
            onClick={() => setReview({ mode: "all" })}
            className="pinned-summary"
          >
            <span>
              <Swap id={String(count)} className="tabular-nums">
                {count}
              </Swap>{" "}
              selected
            </span>
            <span className="pinned-summary-action">
              Review
              <Glyph name="chevronRight" className="glyph-18" />
            </span>
          </button>
        )}
        {review === null && <FormError message={state.formError} />}
        <SubmitButton
          disabled={count === 0}
          pendingLabel="Adding…"
          onClick={(event) => {
            const questions = selected.filter(openQuestion);
            if (questions.length === 0) return;
            event.preventDefault();
            setAsked((current) => new Set([...current, ...questions]));
            setReview({ mode: "questions", ids: questions });
          }}
        >
          {addLabel}
        </SubmitButton>
      </PinnedActions>

      <Sheet
        open={review !== null}
        onClose={() => setReview(null)}
        title={
          review?.mode === "questions"
            ? shown.length === 1
              ? "Which machine?"
              : "Which machines?"
            : "Selected exercises"
        }
        footer={
          <div className="space-y-2">
            {review !== null && <FormError message={state.formError} />}
            <SubmitButton disabled={count === 0} pendingLabel="Adding…">
              {addLabel}
            </SubmitButton>
          </div>
        }
      >
        {review?.mode === "questions" && (
          <p className="type-meta text-ink-2">
            More than one machine here can do {shown.length === 1 ? "this" : "these"}. Leave{" "}
            {NOT_CHOSEN} to choose in the workout.
          </p>
        )}
        <ul className="review-list">
          {shown.map((id) => {
            const exercise = byId.get(id);
            if (!exercise) return null;
            const place = placement(exercise);
            return (
              <li key={id} className="review-row">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 pt-2.5">
                    <p className="picker-row-name">{exercise.name}</p>
                    {already.has(id) && <p className="picker-row-note">Already in this workout</p>}
                  </div>
                  <button
                    type="button"
                    aria-label={`Remove ${exercise.name}`}
                    onClick={() => remove(id)}
                    className="review-remove"
                  >
                    <Glyph name="close" className="glyph-20" />
                  </button>
                </div>
                {place.kind === "choose" ? (
                  <SelectRow
                    label="Machine"
                    value={machineFor(exercise)}
                    onChange={(value) => setChoices((current) => ({ ...current, [id]: value }))}
                    options={[
                      {
                        value: "",
                        label: exercise.requiresEquipment ? NOT_CHOSEN : "Not on a machine",
                      },
                      ...place.options.map((machine) => ({
                        value: machine.id,
                        label: machine.name,
                      })),
                    ]}
                  />
                ) : place.kind === "machine" ? (
                  <p className="pinned-fact">
                    <Glyph name="machine" className="glyph-18" />
                    <span className="min-w-0 [overflow-wrap:anywhere]">
                      On {place.machine.name}
                    </span>
                  </p>
                ) : (
                  <p className="pinned-fact text-ink-2">
                    {place.needsMachine ? NOT_CHOSEN : "No machine needed"}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Sheet>
    </form>
  );
}
