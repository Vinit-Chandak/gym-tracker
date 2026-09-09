import type { Metadata } from "next";

import { AppearanceControl } from "@/components/shell/appearance-control";
import { InstallCard } from "@/components/shell/install-card";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { SubmitButton } from "@/components/ui/form";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { canDeleteSignIn } from "@/server/actions/account";
import { signOutAction } from "@/server/actions/auth";
import { requireUser } from "@/server/auth";
import { getRequestProfile } from "@/server/queries/request-profile";

import { DeleteAccountSettings } from "./delete-account-settings";
import { PasswordSettings } from "./password-settings";
import { ProfileSettings } from "./profile-settings";
import { RestTimerSetting } from "./rest-timer-setting";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const removesSignIn = await canDeleteSignIn();
  const email = profile.email ?? user.email ?? "—";

  return (
    <>
      <PageHeader title="Settings" />
      {/* Five groups, in the order they are needed: who you are, what you train, how it
          looks, who can get in, and the app itself. Each row says only where it goes; what
          is behind it is found by opening it. */}
      <PageContent>
        <Section title="Profile">
          <ProfileSettings
            email={email}
            values={{
              displayName: profile.displayName ?? "",
              timeZone: profile.timeZone,
              preferredUnit: profile.preferredUnit === "lb" ? "lb" : "kg",
              bodyWeightKg: profile.bodyWeightKg,
            }}
          />
        </Section>

        <Section title="Training">
          <List>
            <li>
              <LinkRow href="/settings/programme" title="Programme" />
            </li>
            <li>
              <LinkRow href="/gyms" title="Gyms and machines" />
            </li>
            <li>
              <LinkRow href="/exercises" title="Exercise library" />
            </li>
          </List>
          <RestTimerSetting enabled={profile.restTimerEnabled} />
        </Section>

        <Section title="Appearance">
          <AppearanceControl />
        </Section>

        <Section title="Access">
          <List>
            <li>
              <LinkRow href="/settings/coach" title="Coach access" />
            </li>
          </List>
          <PasswordSettings />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-sm break-words text-ink-muted">{email}</p>
            <form action={signOutAction}>
              <SubmitButton
                variant="secondary"
                size="sm"
                className="w-auto"
                pendingLabel="Signing out…"
              >
                Sign out
              </SubmitButton>
            </form>
          </div>
        </Section>

        <Section title="App">
          <InstallCard />
          <DeleteAccountSettings removesSignIn={removesSignIn} />
        </Section>
      </PageContent>
    </>
  );
}
