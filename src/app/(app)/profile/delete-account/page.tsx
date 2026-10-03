import type { Metadata } from "next";

import { PageHeader } from "@/components/shell/page-header";
import { canDeleteSignIn } from "@/server/actions/account";
import { requireUser } from "@/server/auth";

import { DeleteAccountForm } from "./delete-account-form";

export const metadata: Metadata = { title: "Delete account" };

export default async function DeleteAccountPage() {
  await requireUser();
  const removesSignIn = await canDeleteSignIn();

  // Board Delete account: one sentence, a word to type, one button.
  return (
    <>
      <PageHeader title="Delete account" backHref="/profile" />
      <div className="page-width pb-8">
        {/* The one screen that says what it means in full: what goes is irreversible. */}
        <p className="mt-3 text-[length:var(--ov-type-heading)] leading-[1.45] font-medium">
          Permanently removes your gyms, machines, programmes, sessions, sets, activities and
          tokens. Nothing is exported first.
        </p>
        {removesSignIn ? (
          <DeleteAccountForm />
        ) : (
          <p className="mt-3 type-meta text-ink-2">
            Account deletion is temporarily unavailable. Your account and data have not been
            changed.
          </p>
        )}
      </div>
    </>
  );
}
