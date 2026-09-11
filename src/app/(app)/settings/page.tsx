import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  KeyRound,
  Link2,
  MapPin,
  AiCoach,
  Trash,
  User,
} from "@/components/ui/icons";
import type { Metadata } from "next";

import { AppearanceRow } from "@/components/shell/appearance-row";
import { InstallSection } from "@/components/shell/install-row";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { LinkRow, List, PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { requireUser } from "@/server/auth";
import { listSentence, missingProfileDetails } from "@/server/queries/profile";
import { getRequestProfile } from "@/server/queries/request-profile";

import { RestTimerSetting } from "./rest-timer-setting";
import { SignOutRow } from "./sign-out-row";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const missing = missingProfileDetails(profile);

  return (
    <>
      <PageHeader title="Settings" />
      {/* Boxes of rows, in the order they are needed: who you are, what you train, how it
          looks, who can get in, the app itself, and the way out. A row says only where it
          goes; everything behind it has its own page. */}
      <PageContent>
        <List>
          <li>
            <Link href="/settings/profile" className={PRESSABLE_ROW_CLASS}>
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                <User scale="row" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium [overflow-wrap:anywhere]">
                  {profile.displayName || "Your profile"}
                </span>
                {/* Said here rather than only behind the row: a detail nobody knows is
                    missing is a detail nobody adds. */}
                {missing.length > 0 && (
                  <span className="block text-sm text-warning">
                    Add your {listSentence(missing)}
                  </span>
                )}
              </span>
              <ChevronRight className="shrink-0 text-ink-subtle" aria-hidden />
            </Link>
          </li>
        </List>

        <Section title="Training">
          <List>
            <li>
              <LinkRow href="/settings/programme" icon={ClipboardList} title="Programme" />
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
              <LinkRow href="/settings/ai-coach" icon={AiCoach} title="AI coach" />
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
              <LinkRow href="/settings/password" icon={KeyRound} title="Password" />
            </li>
            <li>
              <LinkRow href="/settings/coach" icon={Link2} title="Coach access" />
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
              href="/settings/delete-account"
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
