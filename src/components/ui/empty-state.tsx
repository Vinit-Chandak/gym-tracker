import type { AppIcon } from "@/components/ui/icons";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: AppIcon;
  title: string;
  description: string;
  /** The way out of the empty state, when there is one. */
  action?: ReactNode;
};

/**
 * A blank region of the sheet that says what will be written here. The icon sits in a ruled
 * cell, like an empty box on a form, so the screen's one highlighter stays with the action
 * that fills it.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-[var(--ov-panel-padding)] py-[clamp(2rem,6vw,3.5rem)] text-center">
      <div className="flex size-12 items-center justify-center rounded-control border border-line-strong bg-surface text-ink">
        <Icon scale="feature" aria-hidden />
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-xs text-sm text-ink-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
