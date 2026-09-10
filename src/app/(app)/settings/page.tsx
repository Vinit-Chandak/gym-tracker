import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  KeyRound,
  Link2,
  MapPin,
  Trash,
  User,
} from "lucide-react";
import type { Metadata } from "next";

import { AppearanceRow } from "@/components/shell/appearance-row";
import { InstallSection } from "@/components/shell/install-row";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import Link from "@/components/ui/app-link";
import { LinkRow, List, PRESSABLE_ROW_CLASS } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { RestTimerSetting } from "./rest-timer-setting";
import { SignOutRow } from "./sign-out-row";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);

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
                <User className="size-5" strokeWidth={1.75} aria-hidden />
              </span>
              <span className="min-w-0 flex-1 font-medium [overflow-wrap:anywhere]">
                {profile.displayName || "Your profile"}
              </span>
              <ChevronRight className="size-5 shrink-0 text-ink-subtle" aria-hidden />
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
