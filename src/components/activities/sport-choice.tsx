"use client";

import { useActionState, useState } from "react";

import { Art } from "@/components/art/art";
import { FormError, SubmitButton } from "@/components/ui/form";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

/** Each sport's form, as its mark on the tile. */
const SPORT_MARK: Record<ActivitySport, "strength" | "run" | "ride" | "swim"> = {
  strength: "strength",
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

/**
 * Choosing the sports this account trains (SPORT-01).
 *
 * The copy says what switching one off actually does, because the honest answer is "less than
 * you fear": history, templates and anything already agreed in a programme stay exactly where
 * they are. Taking a sport out of a programme is a separate, confirmed change.
 */
export function SportChoice({
  action,
  sports,
  enabled,
  submitLabel,
  note,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  sports: readonly ActivitySport[];
  enabled: readonly ActivitySport[];
  submitLabel: string;
  note?: string;
}) {
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const [chosen, setChosen] = useState<ActivitySport[]>(() => [...enabled]);

  // Board Sports: a tile each, the chosen in ink with its mark on a ground square and a check;
  // the note under them; the action pinned.
  return (
    <form action={formAction}>
      <input type="hidden" name="sports" value={chosen.join(",")} />
      <div role="group" aria-label="Sports" className="sport-tiles">
        {sports.map((sport) => {
          const on = chosen.includes(sport);
          return (
            <button
              key={sport}
              type="button"
              role="checkbox"
              aria-checked={on}
              onClick={() =>
                setChosen((current) =>
                  current.includes(sport)
                    ? current.filter((item) => item !== sport)
                    : [...current, sport],
                )
              }
              className="sport-tile"
            >
              <span className="sport-tile-mark">
                <Art kind="mark" sport={SPORT_MARK[sport]} size={28} state={on ? "done" : "todo"} />
              </span>
              <span className="flex w-full items-center justify-between gap-2">
                <span className="sport-tile-word">{ACTIVITY_SPORT_LABELS[sport]}</span>
                {on && <Glyph name="check" className="glyph-20 shrink-0" />}
              </span>
            </button>
          );
        })}
      </div>
      <p className="onboarding-sub mt-3.5">
        {note ??
          "Turning a sport off tidies your shortcuts. Your history, templates and anything already in your programme stay as they are."}
      </p>
      <PinnedActions stack>
        <FormError message={state.formError} />
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </PinnedActions>
    </form>
  );
}
