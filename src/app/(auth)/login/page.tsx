import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { connection } from "next/server";

import { Glyph } from "@/components/ui/glyphs";
import { isSupabaseConfigured } from "@/lib/env";

import { AUTH_LINK } from "../auth-link";
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
      <section aria-labelledby="sign-in" className="space-y-4">
        <h2 id="sign-in" className="type-sheet-title">
          Sign in
        </h2>
        {deleted === "1" && (
          <p role="status" className="flex items-start gap-2 type-meta font-semibold">
            <Glyph name="check" className="mt-px glyph-18" />
            Your account and all of its training data have been deleted.
          </p>
        )}
        {error === "link" && (
          <p role="alert" className="flex items-start gap-2 type-meta font-semibold">
            <Glyph name="warn" className="mt-px glyph-18" />
            That link has expired or has already been used. Sign in, or ask for a new one.
          </p>
        )}
        <LoginForm next={nextPath} />
      </section>
      <p className="border-t border-hair pt-4 type-meta text-ink-2">
        New here?{" "}
        <Link href="/signup" className={AUTH_LINK}>
          Create an account
        </Link>
      </p>
    </>
  );
}
