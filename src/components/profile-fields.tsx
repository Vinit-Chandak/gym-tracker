"use client";

import { useEffect, useRef, useState } from "react";

import { InfoTip } from "@/components/ui/info-tip";
import { Field, Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Select } from "@/components/ui/select";
import { UsernameField } from "@/components/username-field";
import {
  SEXES,
  TRAINING_GOALS,
  type BodyLoadUnit,
  type Sex,
  type TrainingGoal,
} from "@/domain/types";
import { SEX_LABELS, TRAINING_GOAL_LABELS } from "@/lib/labels";
import { heightUnitFor, toFeetAndInches } from "@/lib/units";

export type ProfileFieldValues = {
  displayName: string;
  username: string;
  /** The account's weight unit, which the height's measure follows (ADR 0020). */
  preferredUnit: BodyLoadUnit;
  /** Stored in centimetres; shown in centimetres, or in feet and inches with pounds. */
  heightCm: number | null;
  dateOfBirth: string | null;
  sex: Sex | null;
  trainingGoal: TrainingGoal | null;
};

/** Saying nothing is the fourth answer, and the one the control starts on. */
const SEX_OPTIONS = [
  ...SEXES.map((sex) => ({ value: sex as string, label: SEX_LABELS[sex] })),
  { value: "", label: "Prefer not to say" },
];

/** Where the height's measure is chosen, which is not here. */
const HEIGHT_INFO = "Centimetres with kg, feet and inches with lb: set in Units and time zone.";

const text = (value: number | null): string => (value === null ? "" : String(value));

/**
 * Who the person training is (Edit profile): name, username, height, date of birth, sex and
 * training goal. How the account measures and its time zone are Units and time zone's, and body
 * weight is a reading Today › Log takes; the height is asked in the measure the weight unit
 * gives, and the form says which, so the server never has to guess.
 */
export function ProfileFields({
  values,
  errors,
}: {
  values: ProfileFieldValues;
  errors?: Record<string, string>;
}) {
  const heightUnit = heightUnitFor(values.preferredUnit);
  const imperial = heightUnit === "ftin";
  const initialHeight = values.heightCm === null ? null : toFeetAndInches(values.heightCm);
  // Held here because React clears an uncontrolled field when a form action returns: a refused
  // profile would otherwise lose the height, the date, the sex and the goal while complaining
  // about something else, and each of them is asked for again before it saves.
  const [heightCm, setHeightCm] = useState(() => text(values.heightCm));
  const [feet, setFeet] = useState(() => text(initialHeight?.feet ?? null));
  const [inches, setInches] = useState(() => text(initialHeight?.inches ?? null));
  const [dateOfBirth, setDateOfBirth] = useState(values.dateOfBirth ?? "");
  const [sex, setSex] = useState<string>(values.sex ?? "");
  const [trainingGoal, setTrainingGoal] = useState<string>(values.trainingGoal ?? "");

  /**
   * Holds the form together when a server action returns.
   *
   * React clears the fields of a form whose action has run, so that a form which saved cleanly
   * is ready for the next entry. These fields are not: a refused profile comes back with the
   * answers still in them, because the athlete is being asked to correct one of them, not to
   * type the others again. Everything here is held in state above, so there is nothing for a
   * reset to restore — and it is cancelled rather than re-applied, since React does not write a
   * controlled value back over a select or a radio the browser has just cleared.
   */
  const anchor = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;
    const keep = (event: Event) => event.preventDefault();
    form.addEventListener("reset", keep);
    return () => form.removeEventListener("reset", keep);
  }, []);

  return (
    <>
      <span ref={anchor} hidden />
      <Field label="Name" error={errors?.displayName}>
        <Input
          type="text"
          name="displayName"
          autoComplete="name"
          maxLength={80}
          defaultValue={values.displayName}
          required
        />
      </Field>

      <UsernameField
        defaultValue={values.username}
        current={values.username}
        error={errors?.username}
      />

      <input type="hidden" name="heightUnit" value={heightUnit} />
      {imperial ? (
        <div className="space-y-1.5">
          <div className="flex items-center gap-1 text-[length:var(--ov-type-meta-small)] font-bold text-ink">
            <span>Height</span>
            <InfoTip label="About height">{HEIGHT_INFO}</InfoTip>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Feet" error={errors?.heightFeet}>
              <Input
                type="text"
                name="heightFeet"
                inputMode="numeric"
                value={feet}
                onChange={(event) => setFeet(event.target.value)}
                required
              />
            </Field>
            {/* Inches may be left blank: a height of exactly five feet is five feet. */}
            <Field label="Inches" error={errors?.heightInches}>
              <Input
                type="text"
                name="heightInches"
                inputMode="decimal"
                value={inches}
                onChange={(event) => setInches(event.target.value)}
              />
            </Field>
          </div>
        </div>
      ) : (
        <Field label="Height (cm)" error={errors?.heightCm} info={HEIGHT_INFO}>
          <Input
            type="text"
            name="heightCm"
            inputMode="decimal"
            value={heightCm}
            onChange={(event) => setHeightCm(event.target.value)}
            placeholder="178"
            required
          />
        </Field>
      )}

      <Field
        label="Date of birth"
        error={errors?.dateOfBirth}
        info="For your heart-rate zones and the coach."
      >
        <Input
          type="date"
          name="dateOfBirth"
          autoComplete="bday"
          value={dateOfBirth}
          onChange={(event) => setDateOfBirth(event.target.value)}
          required
        />
      </Field>

      <Field group label="Sex" error={errors?.sex}>
        <SegmentedControl
          name="sex"
          aria-label="Sex"
          options={SEX_OPTIONS}
          value={sex}
          onChange={setSex}
          columns={2}
        />
      </Field>

      <Field label="Training goal" error={errors?.trainingGoal}>
        <Select
          name="trainingGoal"
          value={trainingGoal}
          onChange={(event) => setTrainingGoal(event.target.value)}
          required
        >
          <option value="" disabled>
            Choose a goal
          </option>
          {TRAINING_GOALS.map((goal) => (
            <option key={goal} value={goal}>
              {TRAINING_GOAL_LABELS[goal]}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}
