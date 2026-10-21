import type { ReactNode } from "react";

import { AppMark } from "@/components/shell/app-mark";
import { APP_NAME } from "@/lib/app";

import { AuthTagline } from "./auth-tagline";

/**
 * Signing in, signing up and resetting a password (DESIGN.md, Shapes): the name as the system
 * draws it, its mark beside it in Jost, and on Sign in and Create account the tagline under it
 * in ink 2. Then the page, on the ground at the gutter, like every other screen of the app.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main
      id="main-content"
      className="auth flex min-h-dvh flex-col px-[var(--ov-gutter)] pt-safe pb-safe"
    >
      {/* Anchored under the top rather than centred, so a sentence that appears under the
          fields (an error) pushes nothing that is already there. */}
      {/* On a short phone (iPhone SE, 568 pt) the air above the name gives way first, so the
          form and its action fit on the first screen. */}
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col pt-[max(2rem,10dvh)] pb-8 [@media(height<700px)]:pt-5">
        <header className="auth-head">
          <h1 className="auth-name">
            <AppMark size={46} />
            {APP_NAME}
          </h1>
          <AuthTagline />
        </header>
        <div className="mt-8 space-y-6 [@media(height<700px)]:mt-5">{children}</div>
      </div>
    </main>
  );
}
