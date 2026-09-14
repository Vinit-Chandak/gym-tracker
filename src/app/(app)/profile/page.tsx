import {
  BookOpen,
  ClipboardList,
  KeyRound,
  Link2,
  MapPin,
  AiCoach,
  Trash,
} from "@/components/ui/icons";
import type { Metadata } from "next";

import { AppearanceRow } from "@/components/shell/appearance-row";
import { InstallSection } from "@/components/shell/install-row";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { requireUser } from "@/server/auth";
import { listSentence, missingProfileDetails } from "@/server/queries/profile";
import { getRequestProfile } from "@/server/queries/request-profile";

import { RestTimerSetting } from "./rest-timer-setting";
import { SignOutRow } from "./sign-out-row";

export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const missing = missingProfileDetails(profile);

  return (
    <>
      <PageHeader title="Profile" />
      {/* Boxes of rows, in the order they are needed: who you are, what you train, how it
          looks, who can get in, the app itself, and the way out. A row says only where it
          goes; everything behind it has its own page. */}
      <PageContent>
        {/* The header card is what a friend will see of you (ADR 0026): the avatar, the name
            and the handle. Follower counts join it once there is anyone to count. */}
        <Card>
          <div className="flex items-center gap-4">
            <Avatar username={profile.username} displayName={profile.displayName} size="header" />
            <div className="min-w-0 flex-1">
              <p className="text-lg font-medium [overflow-wrap:anywhere]">
                {profile.displayName || profile.username}
              </p>
              <p className="text-sm [overflow-wrap:anywhere] text-ink-muted">@{profile.username}</p>
              {/* Said here rather than only behind the link: a detail nobody knows is
                  missing is a detail nobody adds. */}
              {missing.length > 0 && (
                <p className="mt-1 text-sm text-warning">Add your {listSentence(missing)}</p>
              )}
            </div>
          </div>
          <LinkButton href="/profile/edit" variant="secondary" size="sm" className="w-full">
            Edit profile
          </LinkButton>
        </Card>

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
