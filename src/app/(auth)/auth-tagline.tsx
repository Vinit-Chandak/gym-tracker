"use client";

import { useSelectedLayoutSegment } from "next/navigation";

import { APP_TAGLINE } from "@/lib/app";

/** The screens where an account is opened: Sign in and Create account. */
const OPENS_AN_ACCOUNT: readonly (string | null)[] = ["login", "signup"];

/**
 * The tagline under the name, where an account is opened; the password screens carry the mark
 * and the name alone (DESIGN.md, Shapes). Read from the segment the layout is showing, which a
 * layout itself is never told.
 */
export function AuthTagline() {
  const segment = useSelectedLayoutSegment();
  if (!OPENS_AN_ACCOUNT.includes(segment)) return null;
  return <p className="mt-2 type-meta text-balance text-ink-2">{APP_TAGLINE}</p>;
}
