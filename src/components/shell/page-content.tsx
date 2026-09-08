import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageContentProps = {
  children: ReactNode;
  className?: string;
};

/** Single-column, phone-width content area used by every tab. */
export function PageContent({ children, className }: PageContentProps) {
  return (
    <div className={cn("mx-auto w-full max-w-lg space-y-4 px-4 py-4", className)}>{children}</div>
  );
}
