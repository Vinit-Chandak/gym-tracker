/**
 * A line built by a shared helper ("3 × 8 @ 70 kg · RIR 2"), joined with commas the way every
 * visible meta line reads ("3 × 8 @ 70 kg, RIR 2"). The helpers still join with middle dots
 * for the coach's plain-text reads; the screens say it as a phrase.
 */
export function phrase(text: string): string {
  return text.split(" · ").join(", ");
}
