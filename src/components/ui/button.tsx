import type { Route } from "next";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-accent text-on-accent active:bg-accent-strong",
  secondary: "bg-surface-raised text-ink border border-line-strong active:bg-line",
  ghost: "bg-transparent text-ink-muted active:bg-surface-raised",
  danger: "bg-danger/15 text-danger border border-danger/30 active:bg-danger/25",
};

// Every size is at least 44px tall: the minimum comfortable iPhone tap target.
const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "h-11 px-3 text-sm",
  md: "h-12 px-4 text-base",
  lg: "h-14 px-5 text-lg",
};

export function buttonClassName(
  variant: ButtonVariant = "primary",
  size: ButtonSize = "md",
  className?: string,
): string {
  return cn(
    "inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-40",
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
