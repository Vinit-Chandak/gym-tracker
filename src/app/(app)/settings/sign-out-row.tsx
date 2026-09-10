"use client";

import { LogOut } from "lucide-react";
import { useFormStatus } from "react-dom";

import { PRESSABLE_ROW_CLASS, RowIcon } from "@/components/ui/link-row";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/server/actions/auth";

function SubmitRow() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cn(PRESSABLE_ROW_CLASS, "disabled:opacity-60")}
    >
      <RowIcon icon={LogOut} />
      <span className="min-w-0 flex-1 font-medium">{pending ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}

/** Signing out is a row like its neighbours; the whole row is the submit button. */
export function SignOutRow() {
  return (
    <form action={signOutAction}>
      <SubmitRow />
    </form>
  );
}
