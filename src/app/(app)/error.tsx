"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { useOnline } from "@/components/shell/connectivity";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Button, LinkButton } from "@/components/ui/button";
import { Warning } from "@/components/ui/icons";

/**
 * The page that could not be drawn: one calm note in the middle of the sheet, the way an
 * empty region says what belongs there, with the two ways on from it. Retry is ruled rather
 * than highlighted: it is disabled while offline, and a greyed highlighter would say the
 * opposite of what it means.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter(),
    online = useOnline();
  // The promise about drafts is only true where there are drafts: they belong to a set
  // being logged, and on Runs or Profile there is nothing of the sort to reassure anyone about.
  const inWorkout = usePathname().startsWith("/workouts/");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <PageHeader title="Something went wrong" />
      <PageContent>
        <div className="flex flex-col items-center px-[var(--ov-panel-padding)] py-[clamp(2rem,6vw,3.5rem)] text-center">
          <div className="flex size-12 items-center justify-center rounded-control bg-highlight text-on-highlight">
            <Warning scale="feature" aria-hidden />
          </div>
          <p className="mt-4 max-w-xs text-ink-muted">
            {online
              ? "The page could not load. Retry to fetch it again."
              : inWorkout
                ? "You’re offline. Reconnect and try again. Unsaved set drafts stay on this device."
                : "You’re offline. Reconnect and try again."}
          </p>
          {error.digest && (
            <p className="mt-2 font-data text-xs text-ink-subtle tabular-nums">
              Reference: {error.digest}
            </p>
          )}
          <div className="mt-6 w-full max-w-xs space-y-2">
            <Button
              disabled={pending || !online}
              onClick={() =>
                startTransition(() => {
                  router.refresh();
                  reset();
                })
              }
              variant="secondary"
              size="lg"
              className="w-full"
            >
              {pending ? "Retrying…" : "Try again"}
            </Button>
            <LinkButton href="/today" variant="ghost" className="w-full">
              Back to Today
            </LinkButton>
          </div>
        </div>
      </PageContent>
    </>
  );
}
