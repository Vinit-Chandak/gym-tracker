"use client";

import type { Route } from "next";
import { useActionState } from "react";

import Link from "@/components/ui/app-link";
import { FormError, SubmitButton } from "@/components/ui/form";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { RowStepper } from "@/components/ui/row-stepper";
import { ScaleField } from "@/components/ui/scale-field";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

type Props = {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  initial: {
    sleepHours: string;
    sleepQuality: string;
    fatigue: string;
    soreness: string;
  };
  /** The workout, which Skip check-in goes straight to. */
  skipHref: Route;
};

/**
 * Pre-session recovery questionnaire (board Check-in). Every reading is optional, and left blank
 * it stays unknown rather than becoming a zero — the recovery rules distinguish the two, and a
 * fabricated reading would speak for somebody who said nothing.
 *
 * Energy is not asked. It was fatigue asked again the other way up — 1 flat to 5 fired up
 * beside 1 fresh to 5 wrecked — and the two answers contradicted each other as often as
 * not. How you feel is now two scales that read the same way: 1 is fine, 5 is the worst.
 */
export function CheckInForm({ action, initial, skipHref }: Props) {
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const value = (key: keyof Props["initial"]) => state.values?.[key] ?? initial[key];

  return (
    <form action={formAction}>
      <section aria-labelledby="check-in-sleep">
        <h2 id="check-in-sleep" className="caption-head mt-3">
          Sleep
        </h2>
        <RowStepper
          label="Hours last night"
          name="sleepHours"
          defaultValue={value("sleepHours")}
          step={0.5}
          max={24}
          less="Half an hour less"
          more="Half an hour more"
          error={state.fieldErrors?.sleepHours}
        />
        <ScaleField
          label="Quality"
          name="sleepQuality"
          ends={["poor", "great"]}
          defaultValue={value("sleepQuality")}
          error={state.fieldErrors?.sleepQuality}
        />
      </section>

      <section aria-labelledby="check-in-feel">
        <h2 id="check-in-feel" className="caption-head mt-3.5">
          How you feel
        </h2>
        <ScaleField
          label="General fatigue"
          name="fatigue"
          ends={["fresh", "wrecked"]}
          defaultValue={value("fatigue")}
          error={state.fieldErrors?.fatigue}
        />
        <ScaleField
          label="Soreness"
          name="soreness"
          ends={["none", "severe"]}
          defaultValue={value("soreness")}
          error={state.fieldErrors?.soreness}
        />
      </section>

      <PinnedActions stack>
        <FormError message={state.formError} />
        <SubmitButton pendingLabel="Saving…">Save and start</SubmitButton>
        <Link href={skipHref} className="text-action">
          Skip check-in
        </Link>
      </PinnedActions>
    </form>
  );
}
