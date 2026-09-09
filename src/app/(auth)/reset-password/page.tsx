import type { Metadata } from "next";
import Link from "@/components/ui/app-link";

import { Card } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";
import { getSessionUser } from "@/server/auth";

import { AUTH_LINK } from "../auth-link";
import { NotConfigured } from "../not-configured";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;
  // Reached with a session created by the recovery link; without one the link has expired.
  const user = await getSessionUser();

  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold">Choose a new password</h2>
        {user ? (
          <>
            <p className="text-sm text-ink-muted">Setting a new password for {user.email}.</p>
            <ResetPasswordForm />
          </>
        ) : (
          <p className="text-sm text-ink-muted">
            This reset link has expired or has already been used. Ask for a new one.
          </p>
        )}
      </Card>
      <p className="text-center text-sm text-ink-muted">
        <Link href={user ? "/today" : "/forgot-password"} className={AUTH_LINK}>
          {user ? "Back to the app" : "Send another link"}
        </Link>
      </p>
    </>
  );
}
