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
 * A blank region of the sheet that says what will be written here. The icon sits on a
 * highlighter mark, the way a note in the margin would, so an empty screen still carries the
 * app's own hand.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-[var(--ov-panel-padding)] py-[clamp(2rem,6vw,3.5rem)] text-center">
      <div className="flex size-12 items-center justify-center rounded-control bg-highlight text-on-highlight">
        <Icon scale="feature" aria-hidden />
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-xs text-sm text-ink-muted">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
