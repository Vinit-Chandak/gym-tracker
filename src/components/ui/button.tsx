import type { Route } from "next";
import Link from "@/components/ui/app-link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * Form v2's buttons (DESIGN.md, Buttons): ink, tonal, waiting, outline, text and destructive,
 * all with 14-px corners. `secondary` and `ghost` are the names the screens already use for
 * tonal and text.
 */
export type ButtonVariant =
  "primary" | "secondary" | "tonal" | "waiting" | "outline" | "ghost" | "text" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  // Disabled, a primary button waits: surface with ink 2, never a faded ink.
  primary: "bg-ink text-on-ink disabled:bg-surface disabled:text-ink-2",
  secondary: "bg-surface text-ink active:bg-surface-2 disabled:text-ink-2",
  tonal: "bg-surface text-ink active:bg-surface-2 disabled:text-ink-2",
  waiting: "bg-surface text-ink-2",
  outline: "border-[1.5px] border-control bg-transparent text-ink disabled:text-ink-2",
  ghost: "bg-transparent px-2.5 text-ink disabled:text-control",
  text: "bg-transparent px-2.5 text-ink disabled:text-control",
  // Destructive: a 2-px ink outline, grey until it can be confirmed.
  danger: "border-2 border-ink bg-transparent text-ink disabled:border-control disabled:text-ink-2",
};

// Every size clears the 44-pt target (48 dp on Android); a primary action stands 56 tall.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[var(--ov-button-short)] px-[14px] py-[8px] text-[length:var(--ov-type-meta)]",
  md: "min-h-[var(--ov-button-short)] px-[16px] py-[8px] text-[length:var(--ov-type-meta)]",
  lg: "min-h-[var(--ov-button)] px-[20px] py-[10px] text-[length:var(--ov-type-button)]",
};

export function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(
    "inline-flex max-w-full items-center justify-center gap-2 rounded-control text-center leading-snug font-bold [overflow-wrap:anywhere] select-none disabled:pointer-events-none",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    className,
  );
}

export type ButtonProps = ComponentProps<"button"> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return <button type={type} className={buttonClassName(variant, size, className)} {...props} />;
}

/** A link that looks like a button. */
export function LinkButton<T extends string>({
  href,
  variant = "primary",
  size = "md",
  className,
  children,
}: {
  href: Route<T>;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClassName(variant, size, className)}>
      {children}
    </Link>
  );
}
