"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";

import { useOnline } from "@/components/shell/connectivity";
import { ErrorScreen } from "@/components/shell/error-screen";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter(),
    online = useOnline();
  // The promise about drafts is only true where there are drafts: they belong to a set
  // being logged, and on Runs or Profile there is nothing of the sort to reassure anyone about.
  const inWorkout = usePathname().startsWith("/workouts/");
  const [pending, startTransition] = useTransition();
  return (
    <ErrorScreen
      online={online}
      inWorkout={inWorkout}
      digest={error.digest}
      pending={pending}
      onRetry={() =>
        startTransition(() => {
          router.refresh();
          reset();
        })
      }
    />
  );
}
