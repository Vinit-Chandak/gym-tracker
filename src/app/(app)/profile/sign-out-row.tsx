"use client";

import { useFormStatus } from "react-dom";

import { Glyph } from "@/components/ui/glyphs";
import { signOutAction } from "@/server/actions/auth";

function SubmitRow() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="nav-row w-full text-left disabled:opacity-60"
    >
      <span className="mark-cell">
        <Glyph name="exit" className="glyph-20" />
      </span>
      <span className="nav-row-label">{pending ? "Signing out…" : "Sign out"}</span>
    </button>
  );
}

/** Signing out is a row like its neighbours, without a chevron: the whole row submits. */
export function SignOutRow() {
  return (
    <li className="nav-row-item">
      <form action={signOutAction}>
        <SubmitRow />
      </form>
    </li>
  );
}
