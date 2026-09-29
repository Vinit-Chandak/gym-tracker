import type { ReactNode } from "react";

/**
 * Compatibility routes resolve before a shell can stream or start navigation prefetches.
 * Keep this group free of loading/Suspense boundaries. Each page verifies onboarding before
 * its owner-scoped lookup; an unavailable link still gets a main landmark and a way back.
 */
export default function LegacyLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="min-h-dvh pb-safe">
      {children}
    </main>
  );
}
