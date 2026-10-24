import type { AppIcon } from "@/components/ui/icons";
import type { ReactNode } from "react";

type EmptyStateProps = {
  icon: AppIcon;
  title: string;
  /** One short line at most, never how the app works (The Need-to-Know Rule). */
  description?: string;
  /** The way out of the empty state, when there is one. */
  action?: ReactNode;
};

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-[var(--ov-panel-padding)] py-[clamp(2rem,6vw,3.5rem)] text-center">
      <div className="flex size-12 items-center justify-center rounded-card bg-surface-raised text-accent">
        <Icon scale="feature" aria-hidden />
      </div>
      {/* Centred under the icon: the lines are evened out, so the last never holds one word
          ("…a cycle at a / time.") at a desktop's width. */}
      <h2 className="mt-4 type-section text-balance">{title}</h2>
      {description && (
        <p className="mt-2 max-w-xs text-sm text-pretty text-ink-muted">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
