import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageContentProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Fluid content gutters shared by phone, tablet and desktop layouts. The header over it gives the
 * gap above (DESIGN.md, The Rhythm Rule), so the content adds none of its own.
 */
export function PageContent({ children, className }: PageContentProps) {
  return (
    <div className={cn("page-width page-stack pb-[var(--section-gap)]", className)}>{children}</div>
  );
}
