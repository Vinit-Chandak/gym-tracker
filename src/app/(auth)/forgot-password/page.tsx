import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { connection } from "next/server";

import { Card } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

import { AUTH_FOOTER, AUTH_HEADING, AUTH_LINK } from "../auth-link";
import { NotConfigured } from "../not-configured";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  await connection();
  const { error } = await props.searchParams;
  if (!isSupabaseConfigured()) return <NotConfigured />;

  return (
    <>
      <Card className="space-y-4">
        <div className="space-y-1">
          <h2 className={AUTH_HEADING}>Reset your password</h2>
          <p className="text-sm text-ink-muted">We&apos;ll email you a link to reset it.</p>
        </div>
        {error === "link" && (
          <p role="alert" className="text-sm text-danger">
            That reset link has expired or has already been used. Ask for a fresh one here.
          </p>
        )}
        <ForgotPasswordForm />
      </Card>
      <p className={AUTH_FOOTER}>
        <Link href="/login" className={AUTH_LINK}>
          Back to sign in
        </Link>
      </p>
    </>
  );
}
