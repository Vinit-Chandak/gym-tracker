import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Text input sized for thumbs; 16px text keeps iOS from zooming in on focus. */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-control border border-line bg-surface-raised px-4 text-base text-ink placeholder:text-ink-subtle focus:border-accent focus:outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink-muted">{label}</span>
      {children}
    </label>
  );
}
