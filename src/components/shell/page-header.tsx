import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  /** Optional trailing control, e.g. a gym switcher or an "add" button. */
  action?: ReactNode;
};

export function PageHeader({ title, action }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/90 pt-safe backdrop-blur-md">
      <div className="mx-auto flex h-header max-w-lg items-center justify-between gap-3 px-4">
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        {action}
      </div>
    </header>
  );
}
