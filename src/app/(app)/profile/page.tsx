import {
  BookOpen,
  ClipboardList,
  KeyRound,
  Link2,
  Lock,
  MapPin,
  AiCoach,
  Trash,
  Users,
} from "@/components/ui/icons";
import type { Metadata } from "next";

import { PersonCard } from "@/components/person-card";
import { AppearanceRow } from "@/components/shell/appearance-row";
import { InstallSection } from "@/components/shell/install-row";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
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
      <PageHeader title="Profile" />
      {/* Boxes of rows, in the order they are needed: who you are, what you train, how it
          looks, who can get in, the app itself, and the way out. A row says only where it
          goes; everything behind it has its own page. */}
      <PageContent>
        {/* The header card is what a friend sees of you (ADR 0026). The warning is said here
            rather than only behind the link: a detail nobody knows is missing is a detail
            nobody adds. The avatar and the name open the page itself, which is where that
            claim can be checked; it used to be reachable only by finding yourself in
            somebody else's followers. */}
        <PersonCard
          person={profile}
          counts={counts}
          countsLinkToFriends
          href={`/u/${profile.username}`}
          warning={missing.length > 0 ? `Add your ${listSentence(missing)}` : undefined}
        >
          <LinkButton href="/profile/edit" variant="secondary" size="sm" className="w-full">
            Edit profile
          </LinkButton>
        </PersonCard>

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
