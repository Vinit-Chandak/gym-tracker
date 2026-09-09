import type { LucideIcon } from "lucide-react";

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Implementation phase in which this screen gets its real content. */
  phase?: number;
};

export function EmptyState({ icon: Icon, title, description, phase }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center px-[var(--panel-padding)] py-[clamp(2rem,6vw,4rem)] text-center">
      <div className="flex size-14 items-center justify-center rounded-full bg-surface-raised text-accent">
        <Icon className="size-7" aria-hidden />
      </div>
      <h2 className="mt-4 text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-xs text-sm text-ink-muted">{description}</p>
      {phase !== undefined && (
        <p className="mt-4 text-xs font-medium tracking-wide text-ink-subtle uppercase">
          Coming in Phase {phase}
        </p>
      )}
    </div>
  );
}
