import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { canDeleteSignIn } from "@/server/actions/account";
import { requireUser } from "@/server/auth";

import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = { title: "Delete account" };

export default async function DeleteAccountPage() {
  await requireUser();
  const removesSignIn = await canDeleteSignIn();

  return (
    <>
      <PageHeader title="Delete account" backHref="/settings" />
      <PageContent>
        {/* The one screen that says what it means in full: what goes is irreversible. */}
        <Card>
          <p className="text-sm">
            Permanently removes your gyms, machines, programmes, sessions, sets, runs and tokens.
            Nothing is exported first.
          </p>
          {!removesSignIn && (
            <p className="text-sm text-ink-muted">
              Your email and password stay with the sign-in provider; ask whoever runs it to remove
              the login itself.
            </p>
          )}
          <DeleteAccountForm />
        </Card>
      </PageContent>
    </>
  );
}
