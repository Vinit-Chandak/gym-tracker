"use client";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Button, LinkButton } from "@/components/ui/button";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { useOnline } from "@/components/shell/connectivity";
import { Card } from "@/components/ui/card";

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
  // being logged, and on Runs or Settings there is nothing of the sort to reassure anyone about.
  const inWorkout = usePathname().startsWith("/workouts/");
  const [pending, startTransition] = useTransition();
  return (
    <>
      <PageHeader title="Something went wrong" />
      <PageContent>
        <Card>
          <p className="text-sm text-ink-muted">
            {online
              ? "The page could not load. Retry to fetch it again."
              : inWorkout
                ? "You’re offline. Reconnect and try again. Unsaved set drafts stay on this device."
                : "You’re offline. Reconnect and try again."}
          </p>
          {error.digest && <p className="text-xs text-ink-subtle">Reference: {error.digest}</p>}
          <Button
            disabled={pending || !online}
            onClick={() =>
              startTransition(() => {
                router.refresh();
                reset();
              })
            }
            variant="secondary"
            className="w-full"
          >
            {pending ? "Retrying…" : "Try again"}
          </Button>
          <LinkButton href="/today" variant="ghost" className="w-full">
            Back to Today
          </LinkButton>
        </Card>
      </PageContent>
    </>
  );
}
