"use client";

import type { Route } from "next";
import { useEffect, useRef, useState, useTransition } from "react";

import { EquipmentArt } from "@/components/equipment-art/equipment-art";
import { Button, LinkButton } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { attempted } from "@/lib/offline-submit";

import { useLoggerActions } from "./logger-actions";
import type { ExerciseVM, SessionVM } from "./view-model";

const OFFLINE = "Connection lost. Try again when connected.";

/** A name as a sentence says it: "hack squat", "EZ curl bar". */
function said(name: string): string {
  return /^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name;
}

/** "a hack squat", "an ab crunch machine": the name as a sentence says it. */
export function withArticle(name: string): string {
  const words = said(name);
  return `${/^[aeiou]/i.test(words) ? "an" : "a"} ${words}`;
}

/** The id of an exercise's machine question, which a waiting Save points at. */
export const machineQuestionId = (workoutExerciseId: string) =>
  `machine-question-${workoutExerciseId}`;

type Props = {
  exercise: ExerciseVM;
  session: SessionVM;
  /** Unsaved set drafts: nothing that swaps the exercise or its machine may run. */
  blocked: boolean;
  /** The logger's own swap, with its pending state and messages. */
  onFallback: (exerciseId: string, instanceId: string | null, name: string) => void;
  onMessage: (message: string | null) => void;
  /** The logger is already saving something. */
  busy: boolean;
  /**
   * "Not sure" was answered: the question steps aside and nothing is recorded. The logger keeps
   * it, so its Save stops waiting for an answer.
   */
  unsure: boolean;
  onUnsure: (unsure: boolean) => void;
  /** Says what an answer did, on the logger's status line (WCAG 4.1.3). */
  onAnnounce: (text: string) => void;
  /**
   * An answer moved the exercise (a machine attached, a family's variant): the logger carries
   * what is typed and not saved there with it, since the answers never wait on Save.
   */
  onMoved: (to: { exerciseId: string; equipmentInstanceId: string } | null | undefined) => void;
};

/**
 * The Log tab's decision block (plan: gradual confirmation during workouts), extended rather
 * than put in front of the workout as a modal. What it asks depends on what the gym's record
 * says about the exercise's machine:
 *
 * - a gym basic nobody has confirmed: its picture and one tap, "Yes, it's here" (registered and
 *   put on the exercise before the first set), "Not here" (recorded; the fallbacks follow), and
 *   for a family "A different one";
 * - any other machine nobody has answered for: "Available" (registered at once, the athlete
 *   stays here), "Not here", or "Not sure", which changes nothing;
 * - a registered machine: "Use" it, or "Not here", which asks whether it has gone (archive it,
 *   history kept) or is only out of use today (a substitute for this session).
 *
 * The options that were always here stay: a fallback, adding one remembered for this gym, and
 * registering the machine with its full details. The question and its answers are one labelled
 * group; when an answer changes what is asked, the new question takes the focus, and what an
 * answer did is said aloud.
 */
export function MachineDecision({
  exercise,
  session,
  blocked,
  onFallback,
  onMessage,
  busy,
  unsure,
  onUnsure,
  onAnnounce,
  onMoved,
}: Props) {
  const actions = useLoggerActions();
  const [pending, startTransition] = useTransition();
  const [gone, setGone] = useState<{ id: string; name: string }[] | null>(null);
  const [variants, setVariants] = useState(false);
  const block = useRef<HTMLDivElement>(null);
  const decision = exercise.decision;
  const ask = decision?.ask ?? null;
  const branch = gone ? "gone" : ask && !unsure ? "ask" : "other";
  const shown = useRef(branch);

  // The button pressed goes with its branch: the new question takes the focus, so a keyboard or
  // a screen reader carries on from it. Focus anywhere else is left alone.
  useEffect(() => {
    if (shown.current === branch) return;
    shown.current = branch;
    const active = document.activeElement;
    if (active && active !== document.body && !block.current?.contains(active)) return;
    block.current?.querySelector<HTMLElement>("[data-question]")?.focus();
  }, [branch]);

  if (!decision) return null;
  const resolution = decision.resolution;
  const registered =
    resolution.status === "direct" && resolution.equipmentInstance
      ? resolution.equipmentInstance
      : null;
  const disabled = pending || busy || blocked;
  // The answers never wait on a set typed but not saved: Save waits on the answer, and what is
  // typed is for the machine in front of the athlete, which is what the answer is about.
  const answering = pending || busy;
  const questionId = machineQuestionId(exercise.id);
  // The type being asked about, which Register with details opens on.
  const askedType = ask?.typeId ?? decision.missingTypes[0]?.id ?? null;
  const substitute = (remember: boolean) =>
    `/workouts/${session.id}/exercises/${exercise.id}/substitute${remember ? "" : "?remember=0"}` as Route;

  const run = <T extends { ok: boolean; error?: string | null }>(
    work: () => Promise<T>,
    done?: (value: T) => void,
    spoken?: string,
  ) =>
    startTransition(async () => {
      const outcome = await attempted(work, OFFLINE);
      if (!outcome.ok) return onMessage(outcome.message);
      if (!outcome.value.ok && outcome.value.error) return onMessage(outcome.value.error);
      onMessage(null);
      if (spoken) onAnnounce(spoken);
      done?.(outcome.value);
    });
  const moved = (value: Awaited<ReturnType<typeof actions.confirmHere>>) =>
    onMoved(value.ok ? value.movedTo : null);
  const here = (typeId: string, name: string) =>
    run(() => actions.confirmHere(exercise.id, typeId), moved, `${name} registered here.`);
  const notHere = (typeId: string, name: string) =>
    startTransition(async () => {
      const outcome = await attempted(() => actions.notHere(exercise.id, typeId), OFFLINE);
      if (!outcome.ok) return onMessage(outcome.message);
      const value = outcome.value;
      if ("machines" in value) {
        setGone(value.machines);
        return onMessage(null);
      }
      if (!value.ok) return onMessage(value.error);
      onMessage(null);
      onAnnounce(`Recorded: no ${said(name)} here.`);
    });
  const archive = (machine: { id: string; name: string }) =>
    run(
      () => actions.archiveMachine(exercise.id, machine.id),
      () => setGone(null),
      `${machine.name} archived. Its sets stay in your history.`,
    );

  // "Has it gone?": a registered machine says the type is here.
  if (gone) {
    const names = gone.map((machine) => machine.name).join(" and ");
    return (
      <div ref={block} className="machine-decision" aria-busy={pending}>
        <p id={questionId} data-question tabIndex={-1} className="type-heading outline-none">
          {names} {gone.length === 1 ? "is" : "are"} registered here. Has{" "}
          {gone.length === 1 ? "it" : "one"} gone?
        </p>
        <div role="group" aria-labelledby={questionId} className="machine-ask-answers">
          {gone.map((machine) => (
            <Button
              key={machine.id}
              variant="danger"
              className="w-full"
              disabled={disabled}
              onClick={() => archive(machine)}
            >
              Archive {machine.name}
            </Button>
          ))}
          <p className="type-meta-small text-ink-2">Archived, its sets stay in your history.</p>
          <div className="flex flex-wrap gap-2">
            <LinkButton href={substitute(false)} variant="tonal" size="sm">
              Out of use today
            </LinkButton>
            <Button variant="text" size="sm" onClick={() => setGone(null)}>
              It&rsquo;s here after all
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const options = (
    <>
      {decision.fallbackOptions.map((option) => (
        <Button
          key={option.fallbackId}
          variant="tonal"
          className="w-full bg-ground"
          disabled={!option.available || disabled}
          onClick={() =>
            onFallback(option.exerciseId, option.equipmentInstanceId, option.exerciseName)
          }
        >
          {option.available ? "Use" : "Not possible here:"} {option.exerciseName}
          {option.equipmentInstanceName ? ` on ${option.equipmentInstanceName}` : ""}
        </Button>
      ))}
      {/* Text buttons keep their words on the block's edge, as elsewhere. */}
      <div className="-ml-2.5 flex flex-wrap gap-2">
        {blocked ? (
          <Button disabled variant="text" size="sm">
            Save or remove drafts first
          </Button>
        ) : (
          <LinkButton href={substitute(true)} variant="text" size="sm">
            Add a fallback
          </LinkButton>
        )}
        {/* Carries the workout along, so registering it lands back here. */}
        <LinkButton
          href={`/gyms/${session.gym.id}/equipment/new?session=${session.id}&exercise=${exercise.id}${askedType ? `&type=${askedType}` : ""}`}
          variant="text"
          size="sm"
        >
          Register with details
        </LinkButton>
      </div>
    </>
  );

  // A machine to settle, asked about with its picture.
  if (ask && !unsure) {
    const basic = ask.kind === "confirm_basic";
    return (
      <div ref={block} className="machine-decision" aria-busy={pending}>
        <div className="machine-ask">
          {ask.art && <EquipmentArt src={ask.art} className="machine-ask-art" />}
          <p id={questionId} data-question tabIndex={-1} className="type-heading outline-none">
            {basic
              ? `Is there ${withArticle(ask.name)} here?`
              : `Is ${withArticle(ask.name)} available here?`}
          </p>
        </div>
        <div role="group" aria-labelledby={questionId} className="machine-ask-answers">
          <Button
            variant="primary"
            className="w-full"
            disabled={answering}
            onClick={() => here(ask.typeId, ask.name)}
          >
            {basic ? "Yes, it’s here" : "Available"}
          </Button>
          <div className="machine-ask-row">
            <Button
              variant="tonal"
              className="bg-ground"
              disabled={answering}
              onClick={() => notHere(ask.typeId, ask.name)}
            >
              Not here
            </Button>
            {basic && ask.family ? (
              <Button
                variant="tonal"
                className="bg-ground"
                aria-haspopup="dialog"
                disabled={answering}
                onClick={() => setVariants(true)}
              >
                A different one
              </Button>
            ) : !basic ? (
              <Button
                variant="tonal"
                className="bg-ground"
                disabled={answering}
                onClick={() => onUnsure(true)}
              >
                Not sure
              </Button>
            ) : null}
          </div>
        </div>
        {!basic && options}
        {ask.family && (
          <Sheet
            open={variants}
            onClose={() => setVariants(false)}
            title={`Which ${ask.family.name.toLowerCase()} is it?`}
          >
            <ul className="equipment-grid">
              {ask.family.variants.map((variant) => (
                <li key={variant.typeId} className="equipment-tile-cell">
                  <button
                    type="button"
                    disabled={answering}
                    onClick={() => {
                      setVariants(false);
                      run(
                        () => actions.chooseVariant(exercise.id, ask.typeId, variant.typeId),
                        moved,
                        `${variant.name} registered here.`,
                      );
                    }}
                    className="equipment-tile w-full text-left"
                  >
                    {variant.art && (
                      <EquipmentArt src={variant.art} className="equipment-tile-art" />
                    )}
                    <span className="equipment-tile-name">
                      <span className="min-w-0 [overflow-wrap:anywhere]">{variant.name}</span>
                    </span>
                    {/* The words that tell it apart: a picture alone is not enough. */}
                    {variant.identification && (
                      <span className="equipment-tile-purpose">{variant.identification}</span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </Sheet>
        )}
      </div>
    );
  }

  // Not sure, a registered machine to use, a fallback in place, or nothing that can be done here.
  return (
    <div ref={block} className="machine-decision" aria-busy={pending}>
      {unsure && ask?.art && <EquipmentArt src={ask.art} className="machine-ask-art" />}
      <p id={questionId} data-question tabIndex={-1} className="type-heading outline-none">
        {registered
          ? "Choose the registered machine for this exercise"
          : unsure && ask
            ? `Not sure about ${withArticle(ask.name)}`
            : resolution.status === "unavailable"
              ? "Not available at this gym"
              : `Needs ${decision.missingTypes.map((t) => t.name.toLowerCase()).join(" or ") || "a machine"}, not registered at ${session.gym.name}`}
      </p>
      {registered && (
        <div role="group" aria-labelledby={questionId} className="machine-ask-answers">
          {/* Several of one kind keep their own names and histories: each is offered. */}
          {(decision.machines.length > 0 ? decision.machines : [registered]).map(
            (machine, index) => (
              <Button
                key={machine.id}
                variant={index === 0 ? "primary" : "tonal"}
                className={index === 0 ? "w-full" : "w-full bg-ground"}
                disabled={disabled}
                onClick={() => onFallback(exercise.exercise.id, machine.id, exercise.exercise.name)}
              >
                Use {machine.name}
              </Button>
            ),
          )}
          <Button
            variant="tonal"
            className="w-full bg-ground"
            disabled={disabled}
            onClick={() =>
              setGone(
                (decision.machines.length > 0 ? decision.machines : [registered]).map((m) => ({
                  id: m.id,
                  name: m.name,
                })),
              )
            }
          >
            Not here
          </Button>
        </div>
      )}
      {unsure && ask && (
        <Button variant="text" size="sm" className="-ml-2.5" onClick={() => onUnsure(false)}>
          Answer after all
        </Button>
      )}
      {options}
    </div>
  );
}

/**
 * "{Machine} not here", from an exercise already on a registered machine, before anything is
 * logged on it: has it gone (archive it, history kept, its kind then recorded as not here), or is it
 * only out of use today (a substitute for this session, not remembered)?
 */
export function MachineGoneSheet({
  open,
  exercise,
  session,
  onClose,
  onMessage,
}: {
  open: boolean;
  exercise: ExerciseVM;
  session: SessionVM;
  onClose: () => void;
  onMessage: (message: string | null) => void;
}) {
  const actions = useLoggerActions();
  const [pending, startTransition] = useTransition();
  const machine = exercise.equipment;
  if (!machine) return null;
  return (
    <Sheet open={open} onClose={onClose} title={`${machine.name} not here?`}>
      <p className="type-body">Has it gone, or is it only out of use today?</p>
      <div className="mt-3 space-y-2">
        <Button
          variant="danger"
          className="w-full"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const outcome = await attempted(
                () => actions.archiveMachine(exercise.id, machine.id),
                OFFLINE,
              );
              if (!outcome.ok) return onMessage(outcome.message);
              if (!outcome.value.ok) return onMessage(outcome.value.error);
              onMessage(null);
              onClose();
            })
          }
        >
          It&rsquo;s gone: archive it
        </Button>
        <p className="type-meta-small text-ink-2">Archived, its sets stay in your history.</p>
        <LinkButton
          href={`/workouts/${session.id}/exercises/${exercise.id}/substitute?remember=0` as Route}
          variant="tonal"
          className="w-full"
        >
          Out of use today
        </LinkButton>
      </div>
    </Sheet>
  );
}
