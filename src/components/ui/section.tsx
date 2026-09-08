import type { ReactNode } from "react";

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <h2 className="text-sm font-semibold tracking-wide text-ink-muted uppercase">{title}</h2>
      {action}
    </div>
  );
}
