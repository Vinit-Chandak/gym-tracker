"use client";

import Link from "@/components/ui/app-link";
import { Button } from "@/components/ui/button";
import { Glyph } from "@/components/ui/glyphs";
import { PinnedActions } from "@/components/ui/pinned-actions";
import { cn } from "@/lib/utils";

/**
 * The one error a screen can meet (board Offline): what happened and what is kept, then Try
 * again, which waits for the connection, and one way back. In a workout it is still the
 * session's screen, with no tab bar.
 */
export function ErrorScreen({
  online,
  inWorkout,
  digest,
  pending = false,
  onRetry,
}: {
  online: boolean;
  /** The promise about drafts is only true where there are drafts: a set being logged. */
  inWorkout: boolean;
  digest?: string;
  pending?: boolean;
  onRetry: () => void;
}) {
  return (
    <div className={cn("error-page page-width pt-safe", inWorkout && "session-page")}>
      <div className="error-page-body">
        <span className="error-page-glyph">
          <Glyph name={online ? "warn" : "offline"} className="glyph-30" />
        </span>
        <h1 className="error-page-title">Something went wrong</h1>
        <p className="error-page-text">
          {online
            ? "The page could not load. Retry to fetch it again."
            : inWorkout
              ? "You’re offline. Reconnect and try again. Unsaved set drafts stay on this device."
              : "You’re offline. Reconnect and try again."}
        </p>
        {digest && <p className="type-caption font-medium text-ink-2">Reference: {digest}</p>}
      </div>
      <PinnedActions stack>
        <Button
          disabled={pending || !online}
          onClick={onRetry}
          variant="secondary"
          size="lg"
          className="w-full"
        >
          {pending ? "Retrying…" : "Try again"}
        </Button>
        <Link href="/today" className="text-action">
          Back to Today
        </Link>
      </PinnedActions>
    </div>
  );
}
