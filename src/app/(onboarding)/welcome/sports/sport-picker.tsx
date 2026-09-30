"use client";

import { useActionState, useState } from "react";

import { FormError, SubmitButton } from "@/components/ui/form";
import { Check } from "@/components/ui/icons";
import { SPORT_ICON } from "@/components/ui/sport-chip";
import { ACTIVITY_SPORT_LABELS, type ActivitySport } from "@/domain/activity";
import { keepsFormOnDisconnect } from "@/lib/offline-submit";
import { SPORT_TONE, TONE_FILL, TONE_SOFT, type Tone } from "@/lib/sport-tone";
import { cn } from "@/lib/utils";
import { INITIAL_FORM_STATE, type FormState } from "@/server/validation/form";

/** The tick on a chosen sport: the fill's own ink, with the fill's colour showing through it. */
const TICK: Record<Tone, string> = {
  lift: "bg-on-lift text-lift",
  run: "bg-on-run text-run",
  ride: "bg-on-ride text-ride",
  swim: "bg-on-swim text-swim",
  food: "bg-on-food text-food",
  rose: "bg-on-rose text-rose",
};

/**
 * The sports step's one question, answered with four big pills (SPORT-01, SCOPE-02). Each is
 * its sport's figure and name; choosing one fills the pill with that sport's colour and ticks
 * it, which is the first place a new account meets the rule that a colour is a sport.
 *
 * The same answer as the profile's sport screen gives, sent the same way: the chosen sports
 * travel as one comma-separated field, and the action decides where setup goes next.
 */
export function SportPicker({
  action,
  sports,
  enabled,
}: {
  action: (previous: FormState, formData: FormData) => Promise<FormState>;
  sports: readonly ActivitySport[];
  enabled: readonly ActivitySport[];
}) {
  const [state, formAction] = useActionState(keepsFormOnDisconnect(action), INITIAL_FORM_STATE);
  const [chosen, setChosen] = useState<ActivitySport[]>(() => [...enabled]);
  const toggle = (sport: ActivitySport) =>
    setChosen((current) =>
      current.includes(sport) ? current.filter((item) => item !== sport) : [...current, sport],
    );

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="sports" value={chosen.join(",")} />
      <ul className="space-y-3">
        {sports.map((sport) => {
          const on = chosen.includes(sport);
          const tone = SPORT_TONE[sport];
          const Icon = SPORT_ICON[sport];
          return (
            <li key={sport}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => toggle(sport)}
                className={cn(
                  "flex min-h-16 w-full pressable items-center gap-3 rounded-chip py-2 pr-4 pl-2 text-left",
                  on ? TONE_FILL[tone] : "bg-surface text-ink",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-12 shrink-0 items-center justify-center rounded-full",
                    on ? "bg-current/15" : TONE_SOFT[tone],
                  )}
                >
                  <Icon scale="row" />
                </span>
                <span className="min-w-0 flex-1 font-display text-display-s [overflow-wrap:anywhere]">
                  {ACTIVITY_SPORT_LABELS[sport]}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full",
                    on ? TICK[tone] : "border-2 border-line-strong",
                  )}
                >
                  {on && <Check />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <FormError message={state.formError} />
      <SubmitButton pendingLabel="Saving…">Continue</SubmitButton>
    </form>
  );
}
