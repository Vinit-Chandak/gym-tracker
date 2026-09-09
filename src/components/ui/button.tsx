import type { Route } from "next";
import Link from "@/components/ui/app-link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent active:bg-accent-strong",
  secondary: "bg-surface text-ink border border-line-strong hover:bg-surface-raised",
  ghost: "bg-transparent text-ink-muted hover:text-ink active:bg-surface-raised",
  // Border rather than a tinted fill: at 3:1 the outline carries the meaning on its own.
  danger: "bg-transparent text-danger border border-danger active:bg-danger/10",
};

// Every size clears the 44px minimum target; only the padding and label size change.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-11 px-3 py-2 text-sm",
  md: "min-h-11 px-4 py-2 text-base",
  lg: "min-h-12 px-4 py-3 text-base",
};

export function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(
    "inline-flex max-w-full items-center justify-center gap-2 rounded-control text-center leading-snug font-medium transition-colors duration-[var(--ov-duration-feedback)] ease-[var(--ov-ease-standard)] select-none disabled:pointer-events-none disabled:opacity-45",
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
