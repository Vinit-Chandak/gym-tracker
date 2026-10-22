"use client";

import { useActionState, useState, useSyncExternalStore } from "react";

import { TimeZoneSelect } from "@/components/time-zone-select";
import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { Field } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SavedNotice } from "@/components/ui/saved-notice";
import { BODY_LOAD_UNITS, type BodyLoadUnit } from "@/domain/types";
import {
  followsWeight,
  followWeight,
  type DistanceUnit,
  type PoolUnit,
  type SportUnits,
} from "@/lib/distance-units";
import { LOAD_UNIT_LABELS } from "@/lib/labels";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import {
  checkTimeZone,
  deviceTimeZone,
  preferredTimeZone,
  sameTimeZone,
  timeZonePlace,
} from "@/lib/time-zones";
import { saveUnitsAction } from "@/server/actions/profile";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

export type UnitsValues = {
  timeZone: string;
  preferredUnit: BodyLoadUnit;
  /** As the account reads them now: chosen, or the weight unit's (ADR 0055). */
  distanceUnit: DistanceUnit;
  poolUnit: PoolUnit;
  /** Whether the account swims, which is when it is asked about pools. */
  swims: boolean;
};

/** Each choice in setup's words (board Units and time zone): one vocabulary for one choice. */
const UNIT_OPTIONS = BODY_LOAD_UNITS.map((unit) => ({
  value: unit as string,
  label: LOAD_UNIT_LABELS[unit],
}));

const DISTANCE_OPTIONS = [
  { value: "km", label: "km" },
  { value: "mi", label: "mi" },
] as const;

const POOL_OPTIONS = [
  { value: "m", label: "Metres" },
  { value: "yd", label: "Yards" },
] as const;

/** A device's zone does not change while a form is open, so there is nothing to subscribe to. */
function noSubscription(): () => void {
  return () => {};
}

/**
 * The zone the browser is in, by its place's current name, or null on the server, where it is
 * unknowable. Read through `useSyncExternalStore` so the server and the first client render agree
 * and hydration is clean.
 */
function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(noSubscription, deviceTimeZone, () => null);
}

/**
 * Profile › Units and time zone (board Units and time zone, as setup proposes them): the weight
 * unit, the road's and the pool's, and the zone every day is dated in. Weight leads, and the
 * distances start from it: switching to pounds takes miles and yards along, unless a distance
 * was set apart from the weight unit (ADR 0055). Pools are asked of a swimmer only.
 */
export function UnitsForm({ values }: { values: UnitsValues }) {
  const [state, formAction, pending] = useActionState(
    keepsFormOnDisconnect(saveUnitsAction),
    INITIAL_FORM_STATE,
  );
  const form = useKeptForm();
  const saved =
    state !== INITIAL_FORM_STATE &&
    state.fieldErrors === undefined &&
    state.formError === undefined &&
    state.values === undefined;
  const errors = state.fieldErrors;

  const detected = useBrowserTimeZone();
  const [editedZone, setEditedZone] = useState<string | null>(null);
  // A zone saved before the field was a list can be an abbreviation or an offset ("EST",
  // "+05:30"), which the app no longer keeps: the field then asks for a place instead.
  const stored = checkTimeZone(values.timeZone);
  const timeZone = editedZone ?? stored.zone ?? "";
  // What the field needs now: a place for a zone saved as something else, or a word that the
  // device is somewhere other than the zone chosen, said by its place.
  const zoneHint =
    timeZone === "" && stored.problem
      ? `Choose a place: “${values.timeZone}” ${
          stored.problem === "unknown" ? "is not a known zone." : "can mean more than one zone."
        }`
      : detected && !sameTimeZone(detected, timeZone)
        ? `This device: ${timeZonePlace(preferredTimeZone(detected))}`
        : undefined;

  const [unit, setUnit] = useState<BodyLoadUnit>(values.preferredUnit);
  const [distances, setDistances] = useState<SportUnits>({
    distanceUnit: values.distanceUnit,
    poolUnit: values.poolUnit,
  });
  // Which distances go with the weight unit: those never set apart from it, as saved, until one
  // is chosen here. A choice the weight unit would give goes with it again (ADR 0055).
  const [follows, setFollows] = useState(() => followsWeight(values.preferredUnit, distances));
  function chooseDistance<K extends keyof SportUnits>(key: K, value: SportUnits[K]) {
    const next = { ...distances, [key]: value };
    setDistances(next);
    setFollows({ ...follows, [key]: followsWeight(unit, next)[key] });
  }
  /** Carries along a distance that was following the weight unit; one set apart stays. */
  function changeUnit(next: BodyLoadUnit) {
    if (next === unit) return;
    setDistances(followWeight(distances, next, follows));
    setUnit(next);
  }

  return (
    <form ref={form} action={formAction} className="space-y-4">
      {/* Each unit a choice of two, with what it decides in its ⓘ. */}
      <Field
        group
        label="Weight"
        error={errors?.preferredUnit}
        info="Loads and body weight, and height with them: centimetres with kg, feet and inches with lb."
      >
        <SegmentedControl
          name="preferredUnit"
          options={UNIT_OPTIONS}
          value={unit}
          onChange={(next) => changeUnit(next as BodyLoadUnit)}
          columns={2}
        />
      </Field>

      <Field
        group
        label="Distance"
        error={errors?.distanceUnit}
        info="Runs and rides. Carries and sleds go in metres with km, in yards with miles."
      >
        <SegmentedControl
          name="distanceUnit"
          options={DISTANCE_OPTIONS}
          value={distances.distanceUnit}
          onChange={(distanceUnit) => chooseDistance("distanceUnit", distanceUnit)}
          columns={2}
        />
      </Field>

      {/* Anyone who does not swim is not asked: their pool goes on as it is, following the
          weight unit unless it was set apart. */}
      {values.swims ? (
        <Field group label="Pools" error={errors?.poolUnit}>
          <SegmentedControl
            name="poolUnit"
            options={POOL_OPTIONS}
            value={distances.poolUnit}
            onChange={(poolUnit) => chooseDistance("poolUnit", poolUnit)}
            columns={2}
          />
        </Field>
      ) : (
        <input type="hidden" name="poolUnit" value={distances.poolUnit} />
      )}

      {/* A place from a list, never typed: every day the app names is dated in it, and an
          abbreviation or an offset can mean one zone here and another in the graphs. */}
      <Field label="Time zone" error={errors?.timeZone} hint={zoneHint}>
        <TimeZoneSelect
          name="timeZone"
          value={timeZone}
          detected={detected}
          onChange={(event) => setEditedZone(event.target.value)}
          required
        />
      </Field>

      <FormError message={state.formError} />
      <SubmitButton pendingLabel="Saving…">Save</SubmitButton>
      {saved && !pending && <SavedNotice>Units and time zone saved</SavedNotice>}
    </form>
  );
}
