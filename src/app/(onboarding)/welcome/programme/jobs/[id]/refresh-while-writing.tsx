"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Asks the server again while the coach writes, less often the longer it takes (5 s, doubling to
 * a minute), and only while the page is in view. The page moves itself on to the programme once
 * there is one, so this is all the screen has to do.
 */
export function RefreshWhileWriting({ writing }: { writing: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!writing) return;
    let delay = 5000;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(() => {
        if (document.visibilityState === "visible") router.refresh();
        delay = Math.min(60_000, delay * 2);
        schedule();
      }, delay);
    };
    schedule();
    // Coming back to the app is when someone most wants to know.
    const back = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", back);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", back);
    };
  }, [writing, router]);
  return null;
}
