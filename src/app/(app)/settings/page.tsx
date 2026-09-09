import type { Metadata } from "next";

import { AppearanceControl } from "@/components/shell/appearance-control";
import { InstallCard } from "@/components/shell/install-card";
import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { SubmitButton } from "@/components/ui/form";
import { LinkRow, List } from "@/components/ui/link-row";
import { Section } from "@/components/ui/section";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { formatIsoDate } from "@/lib/format";
import { canDeleteSignIn } from "@/server/actions/account";
import { signOutAction } from "@/server/actions/auth";
import { setRestTimerEnabledAction } from "@/server/actions/sessions";
import { requireUser } from "@/server/auth";
import { getStarterStatus } from "@/server/queries/profile";
import { getRequestProfile } from "@/server/queries/request-profile";

import { DeleteAccountSettings } from "./delete-account-settings";
import { PasswordSettings } from "./password-settings";
import { ProfileSettings } from "./profile-settings";

export const metadata: Metadata = { title: "Settings" };

/** Programme dates in the same friendly form the rest of the app uses. */
function isoOrDash(date: string | null | undefined): string {
  return date ? formatIsoDate(date) : "—";
}

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getRequestProfile(user.id, user.email);
  const status = await withUser(getDb(), user.id, (tx) => getStarterStatus(tx, user.id));
  const removesSignIn = await canDeleteSignIn();

  return (
    <>
      <PageHeader title="Settings" />
      {/* Five groups, in the order they are needed: who you are, what you train, how it
          looks, who can get in, and the app itself. */}
      <PageContent>
        <Section title="Profile">
          <ProfileSettings
            email={profile.email ?? user.email ?? "—"}
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
              <LinkRow
                href="/settings/programme"
                title="Programme"
                subtitle={
                  status.activeProgram
                    ? `${status.activeProgram.name} · ${isoOrDash(status.activeProgram.startDate)} → ${isoOrDash(status.activeProgram.endDate)}`
                    : "No active programme — pick one to plan your sessions"
                }
              />
            </li>
            <li>
              <LinkRow
                href="/gyms"
                title="Gyms and machines"
                subtitle={`${status.gymCount} ${status.gymCount === 1 ? "gym" : "gyms"} · ${status.equipmentCount} registered · default ${status.defaultGymName ?? "none"}`}
              />
            </li>
            <li>
              <LinkRow
                href="/exercises"
                title="Exercise library"
                subtitle="Search by name or muscle; see defaults and fit"
              />
            </li>
          </List>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="font-medium">Rest timer</p>
              <p className="text-sm text-ink-muted">
                Optional countdown between sets, using each exercise&apos;s rest target. Currently{" "}
                {profile.restTimerEnabled ? "on" : "off"}.
              </p>
            </div>
            <form action={setRestTimerEnabledAction.bind(null, !profile.restTimerEnabled)}>
              <SubmitButton variant="secondary" size="sm" className="w-auto">
                Turn {profile.restTimerEnabled ? "off" : "on"}
              </SubmitButton>
            </form>
          </div>
        </Section>

        <Section
          title="Appearance"
          description="System follows your device. The choice is kept on this device only, and applies the moment you make it."
        >
          <AppearanceControl />
        </Section>

        <Section title="Access">
          <List>
            <li>
              <LinkRow
                href="/settings/coach"
                title="Coach access"
                subtitle="Create and revoke read-only API tokens"
              />
            </li>
          </List>
          <PasswordSettings />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="min-w-0 text-sm text-ink-muted">
              Signed in as {profile.email ?? user.email ?? "this account"}.
            </p>
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
