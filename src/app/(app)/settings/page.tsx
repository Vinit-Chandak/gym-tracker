import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { InstallCard } from "@/components/shell/install-card";
import { SubmitButton } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { LinkRow, List } from "@/components/ui/link-row";
import { getDb } from "@/db/client";
import { formatIsoDate } from "@/lib/format";
import { withUser } from "@/db/with-user";
import { signOutAction } from "@/server/actions/auth";
import { setRestTimerEnabledAction } from "@/server/actions/sessions";
import { requireUser } from "@/server/auth";
import { ensureProfile, getStarterStatus } from "@/server/queries/profile";

import { StarterDataForm } from "./starter-data-form";

export const metadata: Metadata = { title: "Settings" };

/** Programme dates in the same friendly form the rest of the app uses. */
function isoOrDash(date: string | null | undefined): string {
  return date ? formatIsoDate(date) : "—";
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-ink-muted">{label}</span>
      <span className="text-right text-sm font-medium">{value}</span>
    </div>
  );
}

export default async function SettingsPage() {
  const user = await requireUser();
  const { profile, status } = await withUser(getDb(), user.id, async (tx) => ({
    profile: await ensureProfile(tx, user),
    status: await getStarterStatus(tx, user.id),
  }));

  return (
    <>
      <PageHeader title="Settings" />
      <PageContent>
        <Card>
          <h2 className="text-base font-semibold">Account</h2>
          <div className="divide-y divide-line">
            <Row label="Signed in as" value={profile.email ?? user.email ?? "—"} />
            <Row label="Time zone" value={profile.timeZone} />
            <Row label="Units" value={profile.preferredUnit} />
          </div>
          <form action={signOutAction}>
            <SubmitButton variant="secondary" className="w-full">
              Sign out
            </SubmitButton>
          </form>
        </Card>

        <List>
          <li>
            <LinkRow
              href="/settings/coach"
              title="Coach access"
              subtitle="Create and revoke read-only API tokens"
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

        <Card>
          <h2 className="text-base font-semibold">Programme and gyms</h2>
          {status.activeProgram ? (
            <div className="divide-y divide-line">
              <Row label="Programme" value={status.activeProgram.name} />
              {/* "Runs" read as the Runs tab; these are the programme's own dates. */}
              <Row
                label="Dates"
                value={`${isoOrDash(status.activeProgram.startDate)} → ${isoOrDash(status.activeProgram.endDate)}`}
              />
              <Row label="Weeks" value={String(status.activeProgram.weeks ?? "—")} />
              <Row label="Gyms" value={String(status.gymCount)} />
              <Row label="Machines registered" value={String(status.equipmentCount)} />
              <Row label="Default gym" value={status.defaultGymName ?? "None"} />
            </div>
          ) : (
            <StarterDataForm />
          )}
        </Card>

        <Card>
          <h2 className="text-base font-semibold">Rest timer</h2>
          <p className="text-sm text-ink-muted">
            Optional countdown between sets, using each exercise&apos;s rest target. Off by default.
          </p>
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm">{profile.restTimerEnabled ? "On" : "Off"}</span>
            <form action={setRestTimerEnabledAction.bind(null, !profile.restTimerEnabled)}>
              <SubmitButton variant="secondary" size="sm">
                Turn {profile.restTimerEnabled ? "off" : "on"}
              </SubmitButton>
            </form>
          </div>
        </Card>

        <InstallCard />
      </PageContent>
    </>
  );
}
