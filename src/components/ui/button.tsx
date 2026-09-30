import type { Route } from "next";
import Link from "@/components/ui/app-link";
import type { ComponentProps, ReactNode } from "react";

import { TONE_FILL, TONE_SOFT, type Tone } from "@/lib/sport-tone";
import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent active:bg-accent-strong",
  secondary: "bg-surface-raised text-ink active:bg-line",
  ghost: "bg-transparent text-ink-muted hover:text-ink active:bg-surface-raised",
  // Border rather than a tinted fill: at 3:1 the outline carries the meaning on its own.
  danger: "bg-transparent text-danger border border-danger active:bg-surface-raised",
};

// Every size clears the 44px minimum target; only the padding and label size change.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-4 py-2 text-sm",
  md: "min-h-12 px-5 py-2.5 text-base",
  lg: "min-h-14 px-6 py-3 text-[1.0625rem]",
};

/**
 * A button can take a sport's colour (`tone`) for an action that belongs to that sport: a
 * primary one is filled with it (Add food in sunflower), a secondary one takes its soft wash
 * (Log it on a run). Ghost and danger buttons ignore it.
 */
export function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
  tone?: Tone,
): string {
  return cn(
    "inline-flex max-w-full pressable items-center justify-center gap-2 rounded-chip text-center leading-snug font-semibold [overflow-wrap:anywhere] select-none disabled:pointer-events-none disabled:opacity-45",
    tone && variant === "primary"
      ? TONE_FILL[tone]
      : tone && variant === "secondary"
        ? TONE_SOFT[tone]
        : VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  );
}

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: Tone;
};

export function Button({
  variant = "primary",
  size = "md",
  tone,
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button type={type} className={buttonClassName(variant, size, className, tone)} {...props} />
  );
}

/** A link that looks like a button. */
export function LinkButton<T extends string>({
  href,
  variant = "primary",
  size = "md",
  tone,
  className,
  children,
  ...rest
}: {
  href: Route<T>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  tone?: Tone;
  className?: string;
  children: ReactNode;
  "aria-label"?: string;
}) {
  return (
    <Link href={href} className={buttonClassName(variant, size, className, tone)} {...rest}>
      {children}
    </Link>
  );
}
