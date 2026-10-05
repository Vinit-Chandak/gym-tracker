import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/**
 * A line drawing of a piece of equipment (DESIGN.md, Illustrations), laid over `currentColor`
 * with a mask, so it is ink wherever it stands and inverts in a chosen tile. Always beside its
 * name, so it is decorative: screen readers skip it, and the name and the words under it say
 * what it is. `src` comes from the server (`drawingUrls`), which only lists what may be shown.
 */
export function EquipmentArt({ src, className }: { src: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn("equipment-art", className)}
      style={{ "--equipment-art": `url("${src}")` } as CSSProperties}
    />
  );
}
