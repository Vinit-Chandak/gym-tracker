import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { connection } from "next/server";

import { Card } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

import { AUTH_FOOTER, AUTH_HEADING, AUTH_LINK } from "../auth-link";
import { NotConfigured } from "../not-configured";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  // Environment variables are read at request time, never baked in at build time.
  await connection();
  const { next, error, deleted } = await props.searchParams;
  const nextPath = typeof next === "string" ? next : undefined;

  if (!isSupabaseConfigured()) return <NotConfigured />;

  return (
    <>
      <Card className="space-y-4">
        <h2 className={AUTH_HEADING}>Sign in</h2>
        {deleted === "1" && (
          <p role="status" className="text-sm text-success">
            Your account and all of its training data have been deleted.
          </p>
        )}
        {error === "link" && (
          <p role="alert" className="text-sm text-danger">
            That link has expired or has already been used. Sign in, or ask for a new one.
          </p>
        )}
        <LoginForm next={nextPath} />
      </Card>
      <p className={AUTH_FOOTER}>
        New here?{" "}
        <Link href="/signup" className={AUTH_LINK}>
          Create an account
        </Link>
      </p>
    </>
  );
}
