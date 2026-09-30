import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The theme's own scales (globals.css `@theme`), so a size is never mistaken for a colour.
 * Without them `text-display-m` reads as a text colour and `cn("text-display-m", "text-ink")`
 * would drop the size, and two radii would both survive to fight it out in the stylesheet.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["display-xl", "display-l", "display-m", "display-s"],
      radius: ["card", "control", "sheet", "hero", "tile", "chip", "island"],
    },
  },
});

/** Merges Tailwind class names, resolving conflicts (later classes win). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
