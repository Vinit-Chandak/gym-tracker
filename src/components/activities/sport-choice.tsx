"use client";

import { useActionState, useState } from "react";

import { Check } from "@/components/ui/icons";
import { FormError, SubmitButton } from "@/components/ui/form";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { cn } from "@/lib/utils";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

import { SPORT_ICONS } from "./sport-icons";

/**
 * Choosing the sports this account trains (SPORT-01).
 *
 * The copy says what switching one off actually does, because the honest answer is "less than
 * you fear": history, templates and anything already agreed in a programme stay exactly where
 * they are. Taking a sport out of a programme is a separate, confirmed change.
 *
 * Each sport is a cell; the ones chosen take the highlighter, with a tick so the colour is
 * never the only signal.
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
    <form action={formAction} className="space-y-[var(--section-gap)]">
      <input type="hidden" name="sports" value={chosen.join(",")} />
      <section className="box space-y-3 py-4">
        <div className="grid grid-cols-2 gap-2">
          {sports.map((sport) => {
            const on = chosen.includes(sport);
            const Icon = SPORT_ICONS[sport];
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
                  "flex min-h-12 items-center gap-2 rounded-control border px-3 text-left text-sm font-medium transition-[background-color,color,transform,border-color] duration-[var(--ov-duration-feedback)] ease-[var(--ov-ease-out)] select-none active:scale-[0.98]",
                  on
                    ? "border-highlight-strong bg-highlight text-on-highlight"
                    : "border-line-strong bg-surface text-ink-muted active:bg-surface-raised",
                )}
              >
                <Icon className="shrink-0" aria-hidden />
                <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                  {ACTIVITY_SPORT_LABELS[sport]}
                </span>
                {on && <Check className="shrink-0" aria-hidden />}
              </button>
            );
          })}
        </div>
        <p className="text-sm text-ink-muted">
          {note ??
            "Turning a sport off tidies your shortcuts. Your history, templates and anything already in your programme stay as they are."}
        </p>
      </section>
      <div className="space-y-3">
        <FormError message={state.formError} />
        <SubmitButton pendingLabel="Saving…">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
