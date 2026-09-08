"use client";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <PageHeader title="Something went wrong" />
      <PageContent>
        <Card>
          <p className="text-sm text-ink-muted">{error.message || "Unexpected error."}</p>
          {error.digest && <p className="text-xs text-ink-subtle">Reference: {error.digest}</p>}
          <Button onClick={reset} variant="secondary" className="w-full">
            Try again
          </Button>
        </Card>
      </PageContent>
    </>
  );
}
