import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { connection } from "next/server";

import { Glyph } from "@/components/ui/glyphs";
import { isSupabaseConfigured } from "@/lib/env";

import { AUTH_LINK } from "../auth-link";
import { NotConfigured } from "../not-configured";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage(props: PageProps<"/forgot-password">) {
  await connection();
  const { error } = await props.searchParams;
  if (!isSupabaseConfigured()) return <NotConfigured />;

  // On the ground at the gutter, as Sign in is, never in a box (DESIGN.md, Shapes); the Email
  // field and Send reset link say what the screen does.
  return (
    <>
      <section aria-labelledby="reset-password" className="space-y-4">
        <h2 id="reset-password" className="type-sheet-title">
          Reset your password
        </h2>
        {error === "link" && (
          <p role="alert" className="flex items-start gap-2 type-meta font-semibold">
            <Glyph name="warn" className="mt-px glyph-18 shrink-0" />
            <span className="min-w-0">That reset link has expired or has already been used.</span>
          </p>
        )}
        <ForgotPasswordForm />
      </section>
      <p className="border-t border-hair pt-4 type-meta text-ink-2">
        <Link href="/login" className={AUTH_LINK}>
          Back to sign in
        </Link>
      </p>
    </>
  );
}
