"use client";

import type { AppIcon } from "@/components/ui/icons";
import { SPORT_ICON } from "@/components/ui/sport-chip";
import { ACTIVITY_SPORT_LABELS, type EnduranceSport } from "@/domain/activity";
import { SPORT_TONE, TONE_FILL } from "@/lib/sport-tone";
import { cn } from "@/lib/utils";

/**
 * Which sport a form is about, as one chip per sport: its figure and its name, and the chosen
 * one filled with its colour, so the choice reads before a word does.
 *
 * Real radios, named for the sport, so the group works without JavaScript and a label tap
 * chooses it. The accessibility props are the ones `Field` hands a grouped control.
 */
export function SportChips<S extends EnduranceSport>({
  name = "sport",
  sports,
  value,
  onChange,
  id,
  "aria-label": ariaLabel = "Sport",
  "aria-labelledby": labelledBy,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  name?: string;
  sports: readonly S[];
  value: S;
  onChange: (sport: S) => void;
  id?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  return (
    <div
      id={id}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid}
      className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,5.5rem),1fr))] gap-2"
    >
      {sports.map((sport) => {
        const Icon: AppIcon = SPORT_ICON[sport];
        const chosen = sport === value;
        return (
          <label key={sport} className="relative min-w-0">
            <input
              type="radio"
              name={name}
              value={sport}
              checked={chosen}
              onChange={() => onChange(sport)}
              className="peer sr-only"
            />
            {/* The figure over the name, so the name has the chip's whole width. */}
            <span
              className={cn(
                "flex min-h-[4.5rem] pressable cursor-pointer flex-col items-center justify-center gap-1 rounded-tile px-2 py-2.5 text-center text-sm leading-tight font-semibold select-none",
                "peer-focus-visible:ring-2 peer-focus-visible:ring-focus peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-surface",
                chosen ? TONE_FILL[SPORT_TONE[sport]] : "bg-surface-raised text-ink-muted",
              )}
            >
              <Icon aria-hidden />
              <span className="max-w-full hyphens-auto">{ACTIVITY_SPORT_LABELS[sport]}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
