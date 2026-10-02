"use client";

import { useActionState, useState } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Bicycle, Check, Dumbbell, Run, Waves, type AppIcon } from "@/components/ui/icons";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { cn } from "@/lib/utils";
import { chooseSportsAction } from "@/server/actions/sport-preferences";
import { INITIAL_FORM_STATE } from "@/server/validation/form";

const SPORT_ICONS: Record<ActivitySport, AppIcon> = {
  strength: Dumbbell,
  running: Run,
  cycling: Bicycle,
  swimming: Waves,
};

/**
 * The sports step's form: each sport a small panel the athlete ticks, the chosen ones washed
 * in the highlighter's soft tint with a check in the pen, then the one highlighter. Posts the
 * same `sports` field the Profile tab's sport chooser does, as one comma-joined list, so the
 * action behind both is the same.
 */
export function SportsStepForm({
  sports,
  enabled,
  note,
}: {
  sports: readonly ActivitySport[];
  enabled: readonly ActivitySport[];
  note: string;
}) {
  const [state, formAction] = useActionState(
    keepsFormOnDisconnect(chooseSportsAction),
    INITIAL_FORM_STATE,
  );
  const [chosen, setChosen] = useState<ActivitySport[]>(() => [...enabled]);
  const toggle = (sport: ActivitySport) =>
    setChosen((current) =>
      current.includes(sport) ? current.filter((item) => item !== sport) : [...current, sport],
    );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="sports" value={chosen.join(",")} />
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] gap-3">
        {sports.map((sport) => {
          const on = chosen.includes(sport);
          const Icon = SPORT_ICONS[sport];
          return (
            <li key={sport}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(sport)}
                className={cn(
                  "flex min-h-14 w-full items-center gap-3 rounded-card border px-3 py-2 text-left transition-[background-color,border-color,transform] duration-[var(--ov-duration-feedback)] ease-[var(--ov-ease-out)] active:scale-[0.98]",
                  on
                    ? "border-highlight-strong bg-highlight-soft text-ink"
                    : "border-line bg-surface text-ink-muted active:bg-surface-raised",
                )}
              >
                <Icon
                  scale="row"
                  className={cn("shrink-0", on ? "text-ink" : "text-ink-subtle")}
                  aria-hidden
                />
                <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">
                  {ACTIVITY_SPORT_LABELS[sport]}
                </span>
                {on && <Check className="shrink-0 text-pen" aria-hidden />}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-sm text-ink-muted">{note}</p>
      <FormError message={state.formError} />
      <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
    </form>
  );
}
