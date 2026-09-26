import type { CSSProperties } from "react";

import { avatarHue, avatarInitial } from "@/domain/avatar";
import { cn } from "@/lib/utils";

export type AvatarSize = "row" | "header" | "compare";

const SIZE_CLASSES: Record<AvatarSize, string> = {
  row: "size-9 text-base",
  header: "size-16 text-2xl",
  /** Head to head: two of these fit a 320px screen with "VS" between. */
  compare: "aspect-square w-[5.5rem] max-w-full text-4xl",
};

/**
 * The letter-on-a-circle avatar (ADR 0026). The hue is the username's; the two lightnesses
 * are the theme's, chosen in `foundation.css` so the letter reads on the circle in either
 * palette. Decorative: the name is always written beside it.
 */
export function Avatar({
  username,
  displayName,
  size = "row",
  className,
}: {
  username: string;
  displayName?: string | null;
  size?: AvatarSize;
  className?: string;
}) {
  const style = { "--avatar-hue": avatarHue(username) } as CSSProperties;
  return (
    <span
      aria-hidden
      className={cn(
        "avatar inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none",
        SIZE_CLASSES[size],
        className,
      )}
      style={style}
    >
      {avatarInitial(displayName, username)}
    </span>
  );
}
