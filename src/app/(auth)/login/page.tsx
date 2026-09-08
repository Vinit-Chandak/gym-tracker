import type { Metadata } from "next";
import { connection } from "next/server";

import { Card } from "@/components/ui/card";
import { isSupabaseConfigured } from "@/lib/env";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage(props: PageProps<"/login">) {
  // Environment variables are read at request time, never baked in at build time.
  await connection();
  const { next } = await props.searchParams;
  const nextPath = typeof next === "string" ? next : undefined;

  if (!isSupabaseConfigured()) {
    return (
      <Card>
        <h2 className="text-lg font-semibold">Not configured yet</h2>
        <p className="text-sm text-ink-muted">
          Supabase environment variables are missing, so nobody can sign in. Follow{" "}
          <code className="rounded bg-surface-raised px-1 py-0.5 text-xs">SETUP.md</code> in the
          repository, then redeploy.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h2 className="text-lg font-semibold">Sign in</h2>
      <LoginForm next={nextPath} />
    </Card>
  );
}
