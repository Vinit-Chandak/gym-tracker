import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-accent text-on-accent active:bg-accent-strong",
  secondary: "bg-surface-raised text-ink border border-line-strong active:bg-line",
  ghost: "bg-transparent text-ink-muted active:bg-surface-raised",
  danger: "bg-danger/15 text-danger border border-danger/30 active:bg-danger/25",
};

// Every size is at least 44px tall: the minimum comfortable iPhone tap target.
const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-11 px-3 text-sm",
  md: "h-12 px-4 text-base",
  lg: "h-14 px-5 text-lg",
};

export type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
};

export function Button({
  variant = "primary",
  size = "md",
  type = "button",
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap transition-colors select-none disabled:pointer-events-none disabled:opacity-40",
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className,
      )}
      {...props}
    />
  );
}
