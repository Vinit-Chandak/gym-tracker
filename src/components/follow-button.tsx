"use client";

import { useState, useTransition } from "react";

import { ConfirmSheet } from "@/components/confirm-sheet";
import { Button, type ButtonSize } from "@/components/ui/button";
import { followButtonState, type FollowButtonState, type FollowRelation } from "@/domain/follows";
import type { FollowStatus } from "@/domain/types";
import { attempted } from "@/lib/offline-submit";
import { cancelRequestAction, followAction, unfollowAction } from "@/server/actions/follows";

const OFFLINE = "Could not reach the server. Check your connection and try again.";

/** What the button says in each state (plan §3.6). */
export const FOLLOW_LABELS: Record<FollowButtonState, string> = {
  follow: "Follow",
  request: "Request",
  requested: "Requested",
  following: "Following",
  follow_back: "Follow back",
};

/**
 * The five states of following one person, and what a tap does. Following and requesting are
 * one tap; whether it follows or asks is the database's call, and the state it reports is the
 * one shown. Withdrawing a request and unfollowing are the two that ask first, in a sheet.
 */
export function FollowButton({
  personId,
  username,
  relation,
  size = "sm",
  className,
}: {
  personId: string;
  username: string;
  /** Where you stand with them; only your own side changes here. */
  relation: FollowRelation;
  size?: ButtonSize;
  className?: string;
}) {
  const [outgoing, setOutgoing] = useState<FollowStatus | null>(relation.outgoing);
  const [asking, setAsking] = useState<"cancel" | "unfollow" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const state = followButtonState({ ...relation, outgoing });

  const run = (work: () => Promise<FollowStatus | null>) =>
    startTransition(async () => {
      setError(null);
      const outcome = await attempted(work, OFFLINE);
      if (!outcome.ok) {
        setError(outcome.message);
        return;
      }
      setOutgoing(outcome.value);
      setAsking(null);
    });

  const tap = () => {
    if (state === "requested") setAsking("cancel");
    else if (state === "following") setAsking("unfollow");
    else run(() => followAction(personId));
  };

  const settled = state === "following" || state === "requested";
  return (
    <>
      <div className={className}>
        <Button
          variant={settled ? "secondary" : "primary"}
          size={size}
          disabled={pending}
          aria-pressed={settled}
          onClick={tap}
        >
          {pending && !asking ? "…" : FOLLOW_LABELS[state]}
        </Button>
        {error && !asking && (
          <p role="alert" className="mt-1 text-xs text-danger">
            {error}
          </p>
        )}
      </div>
      <ConfirmSheet
        open={asking === "cancel"}
        onClose={() => setAsking(null)}
        title="Cancel request?"
        description={`@${username} has not answered yet. You can ask again at any time.`}
        confirmLabel="Cancel request"
        pendingLabel="Cancelling…"
        pending={pending}
        error={error}
        onConfirm={() => run(async () => (await cancelRequestAction(personId), null))}
      />
      <ConfirmSheet
        open={asking === "unfollow"}
        onClose={() => setAsking(null)}
        title={`Unfollow @${username}?`}
        description="You will stop seeing their training. They are not told."
        confirmLabel="Unfollow"
        pendingLabel="Unfollowing…"
        pending={pending}
        error={error}
        onConfirm={() => run(async () => (await unfollowAction(personId), null))}
      />
    </>
  );
}
