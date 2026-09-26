"use client";

import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";

import { ConfirmSheet } from "@/components/confirm-sheet";
import { PersonRow, type Person } from "@/components/person-row";
import { Button } from "@/components/ui/button";
import { List } from "@/components/ui/link-row";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { attempted } from "@/lib/offline-submit";
import { removeFollowerAction, unfollowAction } from "@/server/actions/follows";

import type { PeopleTab } from "../people-tabs";

type ListedPerson = Person & { id: string };

const OFFLINE = "Could not save. Check your connection and try again.";

/**
 * The People page (ADR 0027): Following and Followers behind one two-way control, the choice
 * carried in the URL so the header card's counts and a refresh land on the right list. Each
 * row opens the person's page; the quiet control at its end ends the relationship, after
 * asking in a sheet.
 */
export function PeopleLists({
  following,
  followers,
  initial,
}: {
  following: ListedPerson[];
  followers: ListedPerson[];
  initial: PeopleTab;
}) {
  const router = useRouter();
  const [tab, setTab] = useOptimistic<PeopleTab>(initial);
  const [, startNavigation] = useTransition();
  const choose = (next: PeopleTab) => {
    startNavigation(() => {
      setTab(next);
      router.replace(`/profile/friends/people?people=${next}`, { scroll: false });
    });
  };
  const people = tab === "following" ? following : followers;

  return (
    <div className="space-y-3">
      <SegmentedControl
        name="people"
        aria-label="People"
        columns={2}
        value={tab}
        onChange={choose}
        options={[
          { value: "following", label: `Following (${following.length})` },
          { value: "followers", label: `Followers (${followers.length})` },
        ]}
      />
      {people.length === 0 ? (
        <p className="px-1 text-sm text-ink-muted">
          {tab === "following" ? "You follow nobody yet." : "Nobody follows you yet."}
        </p>
      ) : (
        <List>
          {people.map((person) => (
            <li key={person.id}>
              <PersonRow person={person}>
                <EndFollowButton person={person} kind={tab} />
              </PersonRow>
            </li>
          ))}
        </List>
      )}
    </div>
  );
}

/** "Unfollow" on a following row, "Remove" on a follower row; both confirm in a sheet. */
function EndFollowButton({ person, kind }: { person: ListedPerson; kind: PeopleTab }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const unfollowing = kind === "following";
  const confirm = () =>
    startTransition(async () => {
      setError(null);
      const outcome = await attempted(
        () => (unfollowing ? unfollowAction(person.id) : removeFollowerAction(person.id)),
        OFFLINE,
      );
      if (!outcome.ok) setError(outcome.message);
      else setOpen(false);
    });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        {unfollowing ? "Unfollow" : "Remove"}
      </Button>
      <ConfirmSheet
        open={open}
        onClose={() => setOpen(false)}
        title={unfollowing ? `Unfollow @${person.username}?` : `Remove @${person.username}?`}
        description={
          unfollowing
            ? "You will stop seeing their training. They are not told."
            : "They will stop seeing your training and can ask to follow you again. They are not told."
        }
        confirmLabel={unfollowing ? "Unfollow" : "Remove follower"}
        pendingLabel={unfollowing ? "Unfollowing…" : "Removing…"}
        pending={pending}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}
