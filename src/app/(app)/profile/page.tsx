import type { Metadata } from "next";

import { AppearanceRow } from "@/components/shell/appearance-row";
import { InstallRow } from "@/components/shell/install-row";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  AiCoach,
  BookOpen,
  ClipboardList,
  KeyRound,
  Link2,
  Lock,
  MapPin,
  Pencil,
  Repeat,
  Run,
  Trash,
  User,
  Users,
} from "@/components/ui/icons";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { requireUser } from "@/server/auth";
import { listSentence, missingProfileDetails } from "@/server/queries/profile";
import { getRequestProfile } from "@/server/queries/request-profile";
import { countRequests } from "@/server/repositories/follows";
import { getDirectoryProfile } from "@/server/repositories/people";

import { RestTimerSetting } from "./rest-timer-setting";
import { SignOutRow } from "./sign-out-row";

export const metadata: Metadata = { title: "Profile" };

/**
 * Coming back to this tab within a minute shows what it showed, without asking the server
 * (ADR 0030). Any change made in the app clears that copy at once; only a change made
 * elsewhere, on another device or by the coach, can take up to the minute to appear.
 */
export const unstable_dynamicStaleTime = 60;

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const missing = missingProfileDetails(profile);
  // Who follows you is read live, never cached with the profile: it is other people's doing.
  const { counts, requests } = await withUser(
    getDb(),
    user.id,
    async (tx) => {
      const [directory, requests] = await Promise.all([
        getDirectoryProfile(tx, profile.username),
        countRequests(tx, user.id),
      ]);
      return { counts: directory ?? { followers: 0, following: 0 }, requests };
    },
    { readOnly: true },
  );
  const followers = `${counts.followers} ${counts.followers === 1 ? "follower" : "followers"}`;
  const following = `${counts.following} following`;
  const personHref = `/u/${profile.username}` as const;

  return (
    <>
      <PageHeader title="Profile" />
      {/* Who you are, then ruled groups of rows in the order they are needed: what you train,
          how it looks, and the account itself. A row says only where it goes; everything
          behind it has its own page. */}
      <PageContent>
        {/* The identity block is what a friend sees of you (ADR 0026); the avatar or the name
            opens your page as a follower sees it. A detail still missing is said here, in pen,
            because it can be tapped: a detail nobody knows is missing is a detail nobody adds. */}
        <section className="box py-4" aria-label="You">
          <div className="flex items-center gap-4">
            {/* The same destination as the name, for a thumb; keyboards and screen readers
                reach it by the name, so this copy stays out of their way. */}
            <Link href={personHref} tabIndex={-1} aria-hidden className="shrink-0 rounded-full">
              <Avatar username={profile.username} displayName={profile.displayName} size="header" />
            </Link>
            <div className="min-w-0 flex-1">
              <Link
                href={personHref}
                className="-mx-1.5 block rounded-control px-1.5 transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
              >
                <h2 className="text-2xl [overflow-wrap:anywhere]">
                  {profile.displayName || profile.username}
                </h2>
                <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">
                  @{profile.username}
                </p>
              </Link>
              <p className="mt-1 flex flex-wrap gap-x-3 text-sm text-ink-muted tabular-nums">
                <Link
                  href="/profile/friends/people?people=followers"
                  className="underline-offset-2 hover:underline"
                >
                  {followers}
                </Link>
                <Link
                  href="/profile/friends/people?people=following"
                  className="underline-offset-2 hover:underline"
                >
                  {following}
                </Link>
              </p>
            </div>
          </div>
          {missing.length > 0 && (
            <Link
              href="/profile/edit"
              className="mt-2 flex min-h-11 items-center gap-2 text-sm font-medium text-pen underline-offset-4 hover:underline"
            >
              <Pencil aria-hidden />
              <span className="min-w-0 [overflow-wrap:anywhere]">
                Add your {listSentence(missing)}
              </span>
            </Link>
          )}
        </section>

        <List>
          <li>
            <LinkRow
              href="/profile/friends"
              icon={Users}
              title="Friends"
              badge={
                requests > 0 && (
                  <Badge tone="accent">
                    {requests} {requests === 1 ? "request" : "requests"}
                  </Badge>
                )
              }
            />
          </li>
        </List>

        <Section title="Training">
          <List>
            <li>
              <LinkRow href="/profile/programme" icon={ClipboardList} title="Programme" />
            </li>
            <li>
              <LinkRow href="/profile/routines" icon={Repeat} title="Saved routines" />
            </li>
            <li>
              <LinkRow href="/gyms" icon={MapPin} title="Gyms and machines" />
            </li>
            <li>
              <LinkRow href="/exercises" icon={BookOpen} title="Exercise library" />
            </li>
            <li>
              <LinkRow href="/profile/sports" icon={Run} title="Sports" />
            </li>
            <li>
              <RestTimerSetting enabled={profile.restTimerEnabled} />
            </li>
            <li>
              <LinkRow href="/profile/ai-coach" icon={AiCoach} title="AI coach" />
            </li>
          </List>
        </Section>

        <Section title="Preferences">
          <List>
            <li>
              <AppearanceRow />
            </li>
            <li>
              <LinkRow href="/profile/privacy" icon={Lock} title="Privacy" />
            </li>
          </List>
        </Section>

        <Section title="Account">
          <List>
            <li>
              <LinkRow href="/profile/edit" icon={User} title="Edit profile" />
            </li>
            <li>
              <LinkRow href="/profile/password" icon={KeyRound} title="Password" />
            </li>
            <li>
              <LinkRow href="/profile/coach" icon={Link2} title="Coach access" />
            </li>
            <InstallRow />
            <li>
              <LinkRow
                href="/profile/delete-account"
                icon={Trash}
                title="Delete account"
                tone="danger"
              />
            </li>
            <li>
              <SignOutRow />
            </li>
          </List>
        </Section>
      </PageContent>
    </>
  );
}
