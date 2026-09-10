import type { Metadata } from "next";

import { PageContent } from "@/components/shell/page-content";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/server/auth";

import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Password" };

export default async function PasswordPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Password" backHref="/settings" />
      <PageContent>
        <Card>
          <PasswordForm />
        </Card>
      </PageContent>
    </>
  );
}
