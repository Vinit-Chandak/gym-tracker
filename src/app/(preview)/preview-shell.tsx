import type { ReactNode } from "react";

import { BottomNav } from "@/components/shell/bottom-nav";

/** A preview screen inside the real shell, with the island standing on the named tab. */
export function PreviewShell({ tab, children }: { tab: string; children: ReactNode }) {
  return (
    <>
      <main className="app-content">{children}</main>
      <BottomNav pathname={tab} />
    </>
  );
}
