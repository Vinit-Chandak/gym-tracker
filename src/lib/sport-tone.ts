import type { ActivitySport } from "@/domain/activity";

/**
 * Colour means sport. Each sport has one hue (stack.css), and everything drawn about that
 * sport — its card, its button, its chart — takes it; everything else stays neutral. Food
 * and recovery are not sports, but they are the other two things the app tracks, so they
 * get a hue of their own the same way.
 */
export type Tone = "lift" | "run" | "ride" | "swim" | "food" | "rose";

export const SPORT_TONE: Record<ActivitySport, Tone> = {
  strength: "lift",
  running: "run",
  cycling: "ride",
  swimming: "swim",
};

/** A tone's fill with its own ink on top: a hero card, a primary button. */
export const TONE_FILL: Record<Tone, string> = {
  lift: "bg-lift text-on-lift",
  run: "bg-run text-on-run",
  ride: "bg-ride text-on-ride",
  swim: "bg-swim text-on-swim",
  food: "bg-food text-on-food",
  rose: "bg-rose text-on-rose",
};

/** A tone's soft wash with its text shade: an icon chip, a selected state. */
export const TONE_SOFT: Record<Tone, string> = {
  lift: "bg-lift-soft text-lift-ink",
  run: "bg-run-soft text-run-ink",
  ride: "bg-ride-soft text-ride-ink",
  swim: "bg-swim-soft text-swim-ink",
  food: "bg-food-soft text-food-ink",
  rose: "bg-rose-soft text-rose-ink",
};
