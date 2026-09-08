"use client";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Button, LinkButton } from "@/components/ui/button";
import { useRouter } from "next/navigation";
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
  const [pending, startTransition] = useTransition();
  return (
    <>
      <PageHeader title="Something went wrong" />
      <PageContent>
        <Card>
          <p className="text-sm text-ink-muted">
            {online
              ? "The page could not load. Retry to fetch it again."
              : "You’re offline. Reconnect and try again. Unsaved set drafts stay on this device."}
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
