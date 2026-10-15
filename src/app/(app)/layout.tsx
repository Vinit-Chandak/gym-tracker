import { Suspense, type ReactNode } from "react";

import { BottomNav } from "@/components/shell/bottom-nav";
import { Connectivity } from "@/components/shell/connectivity";
import { DayRollover } from "@/components/shell/day-rollover";
import { LeftOutOnError } from "@/components/shell/left-out-on-error";
import { LoadingPage } from "@/components/shell/loading-page";
import { SessionStatus } from "@/components/shell/session-status";
import { WarmOnResume } from "@/components/shell/warm-on-resume";
import { todayInTimeZone } from "@/domain/program-calendar";
import { requireOnboardedUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

/**
 * Lets only a signed-in, set-up account past, and keeps the screen on the athlete's day: the
 * profile it reads for the first is the one that holds the time zone for the second, read once
 * per request.
 */
async function AccountGate({ children }: { children: ReactNode }) {
  const user = await requireOnboardedUser();
  const { timeZone } = await getRequestProfile(user.id, user.email, user.displayName);
  return (
    <>
      <DayRollover today={todayInTimeZone(timeZone)} timeZone={timeZone} />
      {children}
    </>
  );
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
        <WarmOnResume />
        <Suspense fallback={<LoadingPage />}>
          <AccountGate>{children}</AccountGate>
        </Suspense>
      </main>
      {/*
        The active workout follows you across destinations, so its strip belongs to the
        shell rather than to any one page. Its own boundary keeps the session lookup off the
        critical path: the page renders when it is ready, and the strip arrives when it is.
        A lookup that fails leaves the strip out rather than the page.
      */}
      <LeftOutOnError>
        <Suspense fallback={null}>
          <SessionStatus />
        </Suspense>
      </LeftOutOnError>
      <BottomNav />
    </div>
  );
}
