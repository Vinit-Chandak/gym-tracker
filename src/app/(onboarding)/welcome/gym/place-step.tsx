"use client";

import { useActionState, useState } from "react";

import { FormError, SubmitButton, useKeptForm } from "@/components/ui/form";
import { gymKindGlyph } from "@/components/ui/glyphs";
import { IconChoice } from "@/components/ui/icon-choice";
import { Field, Input } from "@/components/ui/input";
import { PinnedActions } from "@/components/ui/pinned-actions";
import type { GymKind, TrainingExperience } from "@/domain/types";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { setupSteps } from "@/lib/setup-path";
import { SETUP_PLACE_NAMES } from "@/lib/setup-place";
import { saveSetupPlaceAction } from "@/server/actions/onboarding";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

import { OnboardingFrame } from "../onboarding-frame";

/** The three kinds of place, in the order people train at them. */
const KINDS: readonly GymKind[] = ["gym", "home", "outdoor"];
const KIND_LABELS: Record<GymKind, string> = { gym: "Gym", home: "Home", outdoor: "Outdoors" };

const NAME_FIELD: Record<GymKind, { label: string; placeholder: string }> = {
  gym: { label: "Gym name", placeholder: "e.g. PureGym Leeds" },
  home: { label: "Name", placeholder: "e.g. Garage" },
  outdoor: { label: "Name", placeholder: "e.g. Victoria Park" },
};

/** What follows, where it is worth saying: nothing is asked about a gym's basics. */
function note(kind: GymKind, experience: TrainingExperience | null): string | null {
  if (kind === "gym")
    return experience === "experienced"
      ? null
      : "The usual gym kit is taken as there. When a workout needs anything else, it asks you then, with a picture.";
  return "Nothing is taken as there, so next you tick what you have.";
}

/**
 * Board Where you train: the kind of place as three tiles, then its name, which is optional
 * (U8: the field says what it names, and the action is the same for a home as for a gym).
 * Continue is the only way on for a lifter (B8). The dots follow the kind: at home or outdoors
 * "What you have" comes next.
 */
export function PlaceStep({
  experience,
  place,
}: {
  experience: TrainingExperience | null;
  /** The place this step made before, when the athlete has come back to it. */
  place: { kind: GymKind; name: string } | null;
}) {
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(saveSetupPlaceAction),
    INITIAL_FORM_STATE,
  );
  const form = useKeptForm();
  const [kind, setKind] = useState<GymKind>(place?.kind ?? "gym");
  const [name, setName] = useState(() =>
    place && place.name !== SETUP_PLACE_NAMES[place.kind] ? place.name : "",
  );
  const field = NAME_FIELD[kind];
  const after = note(kind, experience);

  return (
    <OnboardingFrame
      steps={setupSteps({ experience, lifts: true, kind })}
      current="where"
      back="/welcome"
      title="Where do you train?"
    >
      <form ref={form} action={formAction} noValidate>
        <div className="setup-place">
          <IconChoice
            name="kind"
            label="Kind of place"
            options={KINDS.map((value) => ({
              value,
              label: KIND_LABELS[value],
              glyph: gymKindGlyph(value),
            }))}
            value={kind}
            onChange={(value) => setKind(value as GymKind)}
          />
        </div>
        <div className="mt-5">
          <Field label={field.label} aside="Optional" error={state.fieldErrors?.name}>
            <Input
              name="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={field.placeholder}
              maxLength={80}
              autoComplete="off"
            />
          </Field>
        </div>
        {after && <p className="setup-note">{after}</p>}
        <PinnedActions stack>
          <FormError message={state.formError ?? state.fieldErrors?.kind} />
          <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
        </PinnedActions>
      </form>
    </OnboardingFrame>
  );
}
