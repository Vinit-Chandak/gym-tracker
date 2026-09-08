import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LinkRow, List } from "@/components/ui/link-row";
import { getDb } from "@/db/client";
import { withUser } from "@/db/with-user";
import { signOutAction } from "@/server/actions/auth";
import { setRestTimerEnabledAction } from "@/server/actions/sessions";
import { requireUser } from "@/server/auth";
import { ensureProfile, getStarterStatus } from "@/server/queries/profile";

import { StarterDataForm } from "./starter-data-form";

export const metadata: Metadata = { title: "Settings" };

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
            <Button type="submit" variant="secondary" className="w-full">
              Sign out
            </Button>
          </form>
        </Card>

        <List>
          <li>
            <LinkRow
              href="/exercises"
              title="Exercise library"
              subtitle="Search by name or muscle; see defaults and where each exercise fits"
            />
          </li>
        </List>

        <Card>
          <h2 className="text-base font-semibold">Programme and gyms</h2>
          {status.activeProgram ? (
            <div className="divide-y divide-line">
              <Row label="Programme" value={status.activeProgram.name} />
              <Row
                label="Runs"
                value={`${status.activeProgram.startDate ?? "?"} → ${status.activeProgram.endDate ?? "?"}`}
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
              <Button type="submit" variant="secondary" size="sm">
                Turn {profile.restTimerEnabled ? "off" : "on"}
              </Button>
            </form>
          </div>
        </Card>

        <Card>
          <h2 className="text-base font-semibold">Install on iPhone</h2>
          <p className="text-sm text-ink-muted">
            Open this site in Safari, tap Share, then “Add to Home Screen”. It launches full-screen
            like a native app.
          </p>
        </Card>
      </PageContent>
    </>
  );
}
