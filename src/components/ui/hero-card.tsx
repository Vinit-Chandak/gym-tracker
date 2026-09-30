import type { ComponentProps } from "react";

import { TONE_FILL, type Tone } from "@/lib/sport-tone";
import { cn } from "@/lib/utils";

/**
 * The one thing a screen is about, filled with its sport's colour: today's session, the set
 * being logged, what is left to eat. One per screen; everything around it stays neutral.
 *
 * Inside it the palette is re-pointed (`.hero-card` in globals.css): ink, muted text, lines,
 * buttons and badges take the fill's own ink, so a control dropped in reads correctly on
 * cobalt or on sunflower without knowing where it is.
 */
export function HeroCard({
  tone,
  className,
  ...props
}: ComponentProps<"section"> & { tone: Tone }) {
  return (
    <section
      data-hero={tone}
      className={cn("hero-card min-w-0 space-y-4 rounded-hero p-5", TONE_FILL[tone], className)}
      {...props}
    />
  );
}
