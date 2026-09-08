import type { ReactNode } from "react";

import { BottomNav } from "@/components/shell/bottom-nav";

// Shared shell for the tabs: scrollable content above a fixed bottom navigation.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex-1 pb-nav">{children}</div>
      <BottomNav />
    </div>
  );
}
