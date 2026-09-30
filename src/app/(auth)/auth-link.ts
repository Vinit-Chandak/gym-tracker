/**
 * The "switch to the other auth screen" links. They sit alone under a card, so they carry the
 * full-height tap target themselves rather than relying on nearby text.
 */
export const AUTH_LINK =
  "inline-flex min-h-11 items-center rounded-chip px-2 font-semibold text-accent underline-offset-4 hover:underline";

/** The line those links sit on: quiet, centred under the card, the question before the link. */
export const AUTH_FOOTER = "text-center text-callout text-ink-muted";

/** A card's heading on the auth screens: the form's name, in the title size. */
export const AUTH_HEADING = "text-headline font-semibold";
