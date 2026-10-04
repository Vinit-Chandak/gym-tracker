import { cn } from "@/lib/utils";

/**
 * The name's mark (DESIGN.md, Shapes): an ultramarine slab and a vermilion disc standing on an
 * ink line, kept from the first alphabet. It is the name's, not a print, so it is drawn flat on
 * the ground with no paper; the line is ink, so it turns with the theme, and the disc takes the
 * dark theme's lighter vermilion so it is never the brightest thing on a dark screen.
 * Drawn on the generator's 64-unit box (docs/ui-redesign/revamp/form-v2/source/art.mjs).
 */
export function AppMark({ size = 48, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className={cn("block shrink-0 text-ink", className)}
    >
      <rect x="7" y="36" width="25" height="12" fill="var(--ov-ultra)" />
      <circle cx="46" cy="35" r="13" fill="var(--ov-print-run)" />
      <rect x="5" y="51" width="54" height="4" fill="currentColor" />
    </svg>
  );
}
