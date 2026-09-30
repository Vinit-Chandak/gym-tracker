import {
  BookOpen,
  ClipboardList,
  KeyRound,
  Link2,
  Lock,
  MapPin,
  AiCoach,
  ChevronRight,
  Trash,
  User,
  Users,
} from "@/components/ui/icons";
import type { Metadata, Route } from "next";

import type { PersonCounts } from "@/components/person-card";
import { AppearanceRow } from "@/components/shell/appearance-row";
import { InstallSection } from "@/components/shell/install-row";
import { PageContent } from "@/components/shell/page-content";
import Link from "@/components/ui/app-link";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { LinkRow, List, PRESSABLE_ROW_CLASS, RowIcon } from "@/components/ui/link-row";
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

/**
 * "12 followers": the figure leads in the text face's semibold, the word follows, and the
 * pair opens the list it counts. The display face stays with the name, the one thing the
 * header is about; a second display figure under it competed with it, and its "1" read as l.
 */
function Count({ href, value, label }: { href: Route; value: number; label: string }) {
  return (
    <Link
      href={href}
      className="-mx-1.5 flex min-h-11 max-w-full items-center gap-1 rounded-control px-1.5 py-1 text-callout [overflow-wrap:anywhere] transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
    >
      <span className="font-semibold text-ink tabular-nums">{value}</span>
      <span className="text-ink-muted">{label}</span>
    </Link>
  );
}

/**
 * The top of your own tab is you, the way a friend meets you (ADR 0026): the avatar, your
 * name in the display face, your handle and the two counts. It is the screen's header rather
 * than a card on it, so nothing boxes it in. The avatar and the name open your page as a
 * follower sees it; the counts open the lists they count; editing is one pill away.
 */
function ProfileHeader({
  person,
  counts,
}: {
  person: { username: string; displayName: string | null };
  counts: PersonCounts;
}) {
  const href = `/u/${person.username}` as const;
  return (
    <header className="page-header pt-safe">
      <div className="page-width space-y-4 pt-6 pb-1">
        {/* Wraps rather than squeezes: at large text sizes the button takes a line of its own
            instead of pushing the header wider than the screen. */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* The same destination as the name, for a thumb. A keyboard or a screen reader
              reaches it by the name, so this copy stays out of their way. */}
          <Link href={href} tabIndex={-1} aria-hidden className="shrink-0 rounded-full">
            <Avatar username={person.username} displayName={person.displayName} size="header" />
          </Link>
          <LinkButton href="/profile/edit" variant="secondary" size="sm" className="min-w-0">
            Edit profile
          </LinkButton>
        </div>
        <div>
          <h1 className="font-display text-display-l [overflow-wrap:anywhere]">
            <Link
              href={href}
              className="-mx-1 rounded-control px-1 transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised"
            >
              {person.displayName || person.username}
            </Link>
          </h1>
          <p className="mt-1 text-callout [overflow-wrap:anywhere] text-ink-muted">
            @{person.username}
          </p>
          {/* The counts belong to the name, so they sit with it: the links' own tap height
              is the only gap. */}
          <div className="mt-1 flex min-w-0 flex-wrap gap-x-4">
            <Count
              href="/profile/friends/people?people=followers"
              value={counts.followers}
              label={counts.followers === 1 ? "follower" : "followers"}
            />
            <Count
              href="/profile/friends/people?people=following"
              value={counts.following}
              label="following"
            />
          </div>
        </div>
      </div>
    </header>
  );
}

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

  return (
    <>
      <ProfileHeader person={profile} counts={counts} />
      {/* Boxes of rows, in the order they are needed: who you are, what you train, how it
          looks, who can get in, the app itself, and the way out. A row says only where it
          goes; everything behind it has its own page. */}
      <PageContent>
        {/* A detail still missing is said here, first, rather than only behind Edit profile:
            a detail nobody knows is missing is a detail nobody adds. */}
        {missing.length > 0 && (
          <List>
            <li>
              <Link href="/profile/edit" className={PRESSABLE_ROW_CLASS}>
                <RowIcon icon={User} className="bg-warning/14 text-warning" />
                <span className="min-w-0 flex-1 font-semibold [overflow-wrap:anywhere] text-warning">
                  Add your {listSentence(missing)}
                </span>
                <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
              </Link>
            </li>
          </List>
        )}
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
              <LinkRow href="/gyms" icon={MapPin} title="Gyms and machines" />
            </li>
            <li>
              <LinkRow href="/exercises" icon={BookOpen} title="Exercise library" />
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
              <LinkRow href="/profile/password" icon={KeyRound} title="Password" />
            </li>
            <li>
              <LinkRow href="/profile/coach" icon={Link2} title="Coach access" />
            </li>
          </List>
        </Section>

        <InstallSection />

        <List>
          <li>
            <SignOutRow />
          </li>
          <li>
            <LinkRow
              href="/profile/delete-account"
              icon={Trash}
              title="Delete account"
              tone="danger"
            />
          </li>
        </List>
      </PageContent>
    </>
  );
}
