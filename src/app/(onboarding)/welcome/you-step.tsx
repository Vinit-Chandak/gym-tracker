"use client";

import { useActionState, useMemo, useState, useSyncExternalStore } from "react";

import { Art } from "@/components/art/art";
import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { InfoTip } from "@/components/ui/info-tip";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { ACTIVITY_SPORT_LABELS, ACTIVITY_SPORTS, type ActivitySport } from "@/domain/activity";
import type { TrainingExperience } from "@/domain/types";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { liftsAmong, setupSteps, unitsForLocale, type MeasureUnits } from "@/lib/setup-path";
import { deviceTimeZone } from "@/lib/time-zones";
import { saveYouStepAction } from "@/server/actions/onboarding";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

import { Steps } from "./steps";
import { UnitsLine, UnitsSheet } from "./units";

/** Each sport's form, as its mark on the tile. */
const SPORT_MARK: Record<ActivitySport, "strength" | "run" | "ride" | "swim"> = {
  strength: "strength",
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

/** "Which sounds like you?": the two answers; what each leads to is the question's ⓘ. */
const EXPERIENCE: { value: TrainingExperience; label: string }[] = [
  { value: "new", label: "New to this" },
  { value: "experienced", label: "I already train" },
];

/** A device's language and zone do not change while a form is open: nothing to subscribe to. */
function noSubscription(): () => void {
  return () => {};
}

/**
 * Board You: the first step of setup, after sign-up. Two answers decide the rest: which sounds
 * like you, and what you train, with nothing ticked until the athlete ticks it (audit B10).
 * Units and the time zone are read from the phone and said as one quiet line, with Change
 * opening them in a sheet (B11, and no time zone typed as text). The dots count the path these
 * answers lead to, and change with them; a path of one step (only runs, rides or swims) ends
 * here, so its action says Finish.
 */
export function YouStep({
  name,
  experience: savedExperience,
  sports: savedSports,
  units: savedUnits,
  zone: savedZone,
  language,
}: {
  name: string | null;
  experience: TrainingExperience | null;
  /** Null until the athlete has chosen; then nothing is ticked. */
  sports: readonly ActivitySport[] | null;
  /** What the account already chose, or null to read them from the phone. */
  units: MeasureUnits | null;
  /** The zone the account already chose, or null to read it from the phone. */
  zone: string | null;
  /** The request's own language (`Accept-Language`), which the phone's agrees with. */
  language: string | null;
}) {
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(saveYouStepAction),
    INITIAL_FORM_STATE,
  );
  const form = useKeptForm();
  const [experience, setExperience] = useState<TrainingExperience | null>(savedExperience);
  const [sports, setSports] = useState<ActivitySport[]>(() => [...(savedSports ?? [])]);
  // An error stands until the group it is about is answered again (audit U1).
  const [answered, setAnswered] = useState<{ experience: boolean; sports: boolean }>({
    experience: false,
    sports: false,
  });
  const [lastState, setLastState] = useState(state);
  if (lastState !== state) {
    setLastState(state);
    setAnswered({ experience: false, sports: false });
  }

  const phoneLanguage = useSyncExternalStore(
    noSubscription,
    () => navigator.language || null,
    () => language,
  );
  // By its place's current name: a phone in India says Asia/Calcutta, and the account starts in
  // Asia/Kolkata, which every Postgres the save is checked against knows.
  const phoneZone = useSyncExternalStore(noSubscription, deviceTimeZone, () => null);
  const inferred = useMemo(() => unitsForLocale(phoneLanguage), [phoneLanguage]);
  const [editedUnits, setEditedUnits] = useState<MeasureUnits | null>(null);
  const [editedZone, setEditedZone] = useState<string | null>(null);
  const units = editedUnits ?? savedUnits ?? inferred;
  const zone = editedZone ?? savedZone ?? phoneZone ?? "UTC";
  const [sheetOpen, setSheetOpen] = useState(false);

  const lifts = sports.length === 0 ? null : liftsAmong(sports);
  const steps = setupSteps({ experience, lifts, kind: null });
  const first = name?.trim().split(/\s+/)[0];
  const experienceError = !answered.experience ? state.fieldErrors?.trainingExperience : undefined;
  const sportsError =
    !answered.sports || sports.length === 0 ? state.fieldErrors?.sports : undefined;

  return (
    <div className="onboarding page-width">
      <header className="onboarding-head">
        <span />
        <Steps steps={steps} current="you" />
      </header>
      <h1 className="onboarding-title">{first ? `Welcome, ${first}` : "Welcome"}</h1>

      <form ref={form} action={formAction} noValidate>
        {/* A group named by its question, with the question's ⓘ beside it rather than inside a
            legend, where it would be read as part of the group's name. */}
        <div
          role="radiogroup"
          aria-labelledby="you-experience-label"
          aria-describedby={experienceError ? "you-experience-error" : undefined}
          aria-invalid={experienceError ? true : undefined}
          data-field-error={experienceError ? "true" : undefined}
          className="you-group"
        >
          <div className="flex items-center gap-1">
            <span id="you-experience-label" className="you-label">
              {experienceError && (
                <Glyph name="warn" className="glyph-16 shrink-0 text-danger-glyph" />
              )}
              Which sounds like you?
            </span>
            <InfoTip label="About these answers">
              New to this: the coach writes your first plan. I already train: log your way, or set
              up your split.
            </InfoTip>
          </div>
          <div className="you-choices">
            {EXPERIENCE.map((option) => {
              const chosen = experience === option.value;
              return (
                <label key={option.value} className="you-choice">
                  <input
                    type="radio"
                    name="trainingExperience"
                    value={option.value}
                    checked={chosen}
                    onChange={() => {
                      setExperience(option.value);
                      setAnswered((current) => ({ ...current, experience: true }));
                    }}
                    className="sr-only"
                  />
                  <span className="you-choice-head">
                    <span className="you-choice-title">{option.label}</span>
                    {chosen && <Glyph name="check" className="glyph-20 shrink-0" />}
                  </span>
                </label>
              );
            })}
          </div>
          {experienceError && (
            <p id="you-experience-error" role="alert" className="you-error">
              <Glyph name="warn" className="mt-px glyph-18 shrink-0" />
              {experienceError}
            </p>
          )}
        </div>

        <fieldset
          className="you-group"
          aria-describedby={sportsError ? "you-sports-error" : undefined}
          aria-labelledby="you-sports-label"
          aria-invalid={sportsError ? true : undefined}
          data-field-error={sportsError ? "true" : undefined}
        >
          <legend id="you-sports-label" className="you-label">
            {sportsError && <Glyph name="warn" className="glyph-16 shrink-0 text-danger-glyph" />}
            What do you train?
          </legend>
          <input type="hidden" name="sports" value={sports.join(",")} />
          <div className="sport-chips">
            {ACTIVITY_SPORTS.map((sport) => {
              const on = sports.includes(sport);
              return (
                <label key={sport} className="sport-chip">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => {
                      setSports((current) =>
                        current.includes(sport)
                          ? current.filter((item) => item !== sport)
                          : ACTIVITY_SPORTS.filter(
                              (item) => item === sport || current.includes(item),
                            ),
                      );
                      setAnswered((current) => ({ ...current, sports: true }));
                    }}
                    className="sr-only"
                  />
                  <span className="sport-chip-mark">
                    <Art
                      kind="mark"
                      sport={SPORT_MARK[sport]}
                      size={22}
                      state={on ? "done" : "todo"}
                    />
                  </span>
                  <span className="sport-chip-word">{ACTIVITY_SPORT_LABELS[sport]}</span>
                  {on && <Glyph name="check" className="glyph-20 shrink-0" />}
                </label>
              );
            })}
          </div>
          {sportsError && (
            <p id="you-sports-error" role="alert" className="you-error">
              <Glyph name="warn" className="mt-px glyph-18 shrink-0" />
              {sportsError}
            </p>
          )}
        </fieldset>

        <input type="hidden" name="preferredUnit" value={units.weight} />
        <input type="hidden" name="distanceUnit" value={units.distance} />
        <input type="hidden" name="poolUnit" value={units.pool} />
        <input type="hidden" name="timeZone" value={zone} />
        <UnitsLine
          units={units}
          zone={zone}
          sports={sports}
          error={state.fieldErrors?.timeZone}
          onChange={() => setSheetOpen(true)}
        />

        <PinnedActions stack>
          <FormError message={state.formError} />
          <SubmitButton pendingLabel="Saving…">
            {lifts === false ? "Finish" : "Continue"}
          </SubmitButton>
        </PinnedActions>
      </form>

      <UnitsSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        units={units}
        zone={zone}
        phoneZone={phoneZone}
        sports={sports}
        onUnits={setEditedUnits}
        onZone={setEditedZone}
      />
    </div>
  );
}
