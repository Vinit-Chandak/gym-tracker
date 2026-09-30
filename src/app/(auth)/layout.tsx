import type { ReactNode } from "react";

import { Wordmark } from "@/components/shell/wordmark";
import { SportChip } from "@/components/ui/sport-chip";
import { ACTIVITY_SPORTS } from "@/domain/activity";
import { APP_TAGLINE } from "@/lib/app";

/**
 * The first thing anyone sees: the name, as large as the display face sets anything, the one
 * line that says what it is for, and a form with a single button. The four sports it tracks
 * sit above the name in their own colours, which is the whole of the brand before a word is
 * read; everything else on the screen is the form.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col pt-safe pb-safe">
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-8 px-4 py-10">
        <header className="px-1">
          <div className="flex gap-2">
            {ACTIVITY_SPORTS.map((sport) => (
              <SportChip key={sport} sport={sport} size="sm" />
            ))}
          </div>
          <h1 className="mt-5 font-display text-display-xl">
            <Wordmark />
          </h1>
          <p className="mt-3 text-headline leading-snug text-balance text-ink-muted">
            {APP_TAGLINE}
          </p>
        </header>
        <div className="space-y-4">{children}</div>
      </div>
    </div>
  );
}
