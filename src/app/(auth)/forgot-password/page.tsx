import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { connection } from "next/server";

import { Card } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

import { AUTH_LINK } from "../auth-link";
import { NotConfigured } from "../not-configured";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  await connection();
  const { error } = await props.searchParams;
  if (!isSupabaseConfigured()) return <NotConfigured />;

  return (
    <>
      <Card>
        <h2 className="text-lg font-semibold">Reset your password</h2>
        {error === "link" && (
          <p role="alert" className="text-sm text-danger">
            That reset link has expired or has already been used. Here is a fresh start.
          </p>
        )}
        <p className="text-sm text-ink-muted">
          Enter your email and we will send you a link to choose a new password.
        </p>
        <ForgotPasswordForm />
      </Card>
      <p className="text-center text-sm text-ink-muted">
        <Link href="/login" className={AUTH_LINK}>
          Back to sign in
        </Link>
      </p>
    </>
  );
}
