import type { Metadata } from "next";
import Link from "@/components/ui/app-link";
import { connection } from "next/server";

import { isSupabaseConfigured } from "@/lib/env";

import { AUTH_LINK } from "../auth-link";
import { NotConfigured } from "../not-configured";
import { SignUpForm } from "./signup-form";

export const metadata: Metadata = { title: "Create an account" };

/** Board Sign up: on the ground at the gutter, like Sign in, never in a box (DESIGN.md, Shapes). */
export default async function SignUpPage() {
  await connection();
  if (!isSupabaseConfigured()) return <NotConfigured />;

  return (
    <>
      <section aria-labelledby="sign-up" className="space-y-4">
        <h2 id="sign-up" className="type-sheet-title">
          Create your account
        </h2>
        <SignUpForm />
      </section>
      <p className="border-t border-hair pt-4 type-meta text-ink-2">
        Already have an account?{" "}
        <Link href="/login" className={AUTH_LINK}>
          Sign in
        </Link>
      </p>
    </>
  );
}
