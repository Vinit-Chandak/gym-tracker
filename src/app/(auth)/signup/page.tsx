import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { connection } from "next/server";

import { Card } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

import { AUTH_LINK } from "../auth-link";
import { NotConfigured } from "../not-configured";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an account" };

export default async function SignUpPage() {
  await connection();
  if (!isSupabaseConfigured()) return <NotConfigured />;

  return (
    <>
      <Card>
        <h2 className="text-lg font-medium">Create an account</h2>
        <SignUpForm />
      </Card>
      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className={AUTH_LINK}>
          Sign in
        </Link>
      </p>
    </>
  );
}
