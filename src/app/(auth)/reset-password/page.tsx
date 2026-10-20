import type { Metadata } from "next";
import Link from "@/components/ui/app-link";

import { Glyph } from "@/components/ui/glyphs";
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

  // On the ground at the gutter, as Sign in is, never in a box (DESIGN.md, Shapes). An expired
  // link says so; the way on, Send another link, is under it.
  return (
    <>
      <section aria-labelledby="new-password" className="space-y-4">
        <h2 id="new-password" className="type-sheet-title">
          Choose a new password
        </h2>
        {user ? (
          <>
            <p className="type-meta [overflow-wrap:break-word] text-ink-2">For {user.email}</p>
            <ResetPasswordForm />
          </>
        ) : (
          <p role="alert" className="flex items-start gap-2 type-meta font-semibold">
            <Glyph name="warn" className="mt-px glyph-18 shrink-0" />
            <span className="min-w-0">This reset link has expired or has already been used.</span>
          </p>
        )}
      </section>
      <p className="border-t border-hair pt-4 type-meta text-ink-2">
        <Link href={user ? "/today" : "/forgot-password"} className={AUTH_LINK}>
          {user ? "Back to the app" : "Send another link"}
        </Link>
      </p>
    </>
  );
}
