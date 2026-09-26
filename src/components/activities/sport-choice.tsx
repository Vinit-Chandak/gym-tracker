"use client";

import { useActionState, useState } from "react";

import { Card } from "@/components/ui/card";
import { FormError, SubmitButton } from "@/components/ui/form";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { cn } from "@/lib/utils";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

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

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="sports" value={chosen.join(",")} />
      <Card>
        <div className="grid grid-cols-2 gap-2">
          {sports.map((sport) => {
            const on = chosen.includes(sport);
            return (
              <button
                key={sport}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  setChosen((current) =>
                    current.includes(sport)
                      ? current.filter((item) => item !== sport)
                      : [...current, sport],
                  )
                }
                className={cn(
                  "h-11 rounded-control border px-3 text-sm",
                  on
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-line-strong text-ink-muted",
                )}
              >
                {ACTIVITY_SPORT_LABELS[sport]}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-ink-muted">
          {note ??
            "Turning a sport off tidies your shortcuts. Your history, templates and anything already in your programme stay as they are."}
        </p>
      </Card>
      <FormError message={state.formError} />
      <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
    </form>
  );
}
