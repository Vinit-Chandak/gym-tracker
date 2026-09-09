import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type PageContentProps = {
  children: ReactNode;
  className?: string;
};

/** Fluid content gutters shared by phone, tablet and desktop layouts. */
export function PageContent({ children, className }: PageContentProps) {
  return (
    <div className={cn("page-width page-stack py-[var(--section-gap)]", className)}>{children}</div>
  );
}
