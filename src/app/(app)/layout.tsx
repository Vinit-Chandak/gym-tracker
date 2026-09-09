import type { ReactNode } from "react";

import { BottomNav } from "@/components/shell/bottom-nav";
import { Connectivity } from "@/components/shell/connectivity";
import { requireOnboardedUser } from "@/server/auth";

// Shared shell for the tabs: scrollable content above a fixed bottom navigation.
export default async function AppLayout({ children }: { children: ReactNode }) {
  await requireOnboardedUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <Connectivity />
      <div className="flex-1 pb-nav">{children}</div>
      <BottomNav />
    </div>
  );
}
