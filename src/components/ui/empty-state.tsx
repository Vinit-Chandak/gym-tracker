import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** The way out of the empty state, when there is one. */
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-[var(--ov-panel-padding)] py-[clamp(2rem,6vw,3.5rem)] text-center">
      <div className="flex size-12 items-center justify-center rounded-card bg-surface-raised text-accent">
        <Icon className="size-6" aria-hidden />
      </div>
      <h2 className="mt-4 text-lg font-medium">{title}</h2>
      <p className="mt-2 max-w-xs text-sm text-ink-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
