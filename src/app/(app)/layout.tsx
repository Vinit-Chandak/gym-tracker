import { Suspense, type ReactNode } from "react";

import { BottomNav } from "@/components/shell/bottom-nav";
import { Connectivity } from "@/components/shell/connectivity";
import { LoadingPage } from "@/components/shell/loading-page";
import { SessionStatus } from "@/components/shell/session-status";
import { requireOnboardedUser } from "@/server/auth";

async function AccountGate({ children }: { children: ReactNode }) {
  await requireOnboardedUser();
  return children;
}

// The shell can stream/prefetch before account and page queries complete. Protected
// content stays behind the gate; each page/action also verifies its session and RLS.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[110] focus:rounded-control focus:bg-accent focus:p-3 focus:text-on-accent"
      >
        Skip to content
      </a>
      <main id="main-content" className="app-content">
        <Connectivity />
        <Suspense fallback={<LoadingPage />}>
          <AccountGate>{children}</AccountGate>
        </Suspense>
      </main>
      {/*
        The active workout follows you across destinations, so its strip belongs to the
        shell rather than to any one page. Its own boundary keeps the session lookup off the
        critical path: the page renders when it is ready, and the strip arrives when it is.
      */}
      <Suspense fallback={null}>
        <SessionStatus />
      </Suspense>
      <BottomNav />
    </div>
  );
}
