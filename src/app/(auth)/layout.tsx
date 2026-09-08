import { Dumbbell } from "lucide-react";
import type { ReactNode } from "react";

import { APP_NAME } from "@/lib/app";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-4 pt-safe pb-safe">
      <div className="w-full max-w-sm space-y-6">
        <header className="flex flex-col items-center gap-2">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-surface-raised text-accent">
            <Dumbbell className="size-8" aria-hidden />
          </span>
          <h1 className="text-2xl font-semibold tracking-tight">{APP_NAME}</h1>
        </header>
        {children}
      </div>
    </div>
  );
}
