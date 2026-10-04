import type { ReactNode } from "react";

import { AppMark } from "@/components/shell/app-mark";
import { APP_NAME, APP_TAGLINE } from "@/lib/app";

/**
 * Signing in, signing up and resetting a password (DESIGN.md, Shapes): the name as the system
 * draws it, its mark beside it in Jost, and the tagline under it in ink 2. Then the page, on the
 * ground at the gutter, like every other screen of the app.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth flex min-h-dvh flex-col px-[var(--ov-gutter)] pt-safe pb-safe">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-8">
        <header className="auth-head">
          <h1 className="auth-name">
            <AppMark size={46} />
            {APP_NAME}
          </h1>
          <p className="mt-2 type-meta text-balance text-ink-2">{APP_TAGLINE}</p>
        </header>
        <div className="mt-8 space-y-6">{children}</div>
      </div>
    </div>
  );
}
