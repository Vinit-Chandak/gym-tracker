import { Dumbbell } from "lucide-react";
import type { ReactNode } from "react";

import { APP_NAME, APP_TAGLINE } from "@/lib/app";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 py-8 pt-safe pb-safe">
      <div className="w-full max-w-sm space-y-6">
        <header className="flex flex-col items-center gap-2 text-center">
          <span className="flex size-14 items-center justify-center rounded-card border border-line text-accent">
            <Dumbbell className="size-8" aria-hidden />
          </span>
          <h1 className="text-xl font-medium">{APP_NAME}</h1>
          <p className="text-sm text-balance text-ink-muted">{APP_TAGLINE}</p>
        </header>
        {children}
      </div>
    </div>
  );
}
