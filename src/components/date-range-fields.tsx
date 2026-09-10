"use client";

import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useTransition } from "react";

import { Button } from "./ui/button";
import { Field, Input } from "./ui/input";

/**
 * The From and To of a screen whose range lives in the URL, for the filter sheet.
 *
 * Applying is a navigation, so the two dates are read on the server that answers it; the
 * panel stays open and says it is loading until that navigation commits, then closes
 * itself, which is the only signal a sheet can give that the range behind it changed.
 */
export function DateRangeFields({
  from,
  to,
  onApplied,
}: {
  from: string;
  to: string;
  /** Called once the new range has loaded. */
  onApplied?: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const applying = useRef(false);

  useEffect(() => {
    if (pending || !applying.current) return;
    applying.current = false;
    onApplied?.();
  }, [pending, onApplied]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        const params = new URLSearchParams(window.location.search);
        params.set("from", String(data.get("from")));
        params.set("to", String(data.get("to")));
        applying.current = true;
        startTransition(() => router.push(`${pathname}?${params}` as Route));
      }}
      className="space-y-3"
    >
      {/* One field per row until a tablet's width. A date field carries a native picker
          whose own width the platform decides, so two of them share a phone's row only by
          luck: on iOS the first outgrew its column and disappeared under the second. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="From">
          <Input name="from" type="date" defaultValue={from} required />
        </Field>
        <Field label="To">
          <Input name="to" type="date" defaultValue={to} required />
        </Field>
      </div>
      <Button type="submit" variant="secondary" size="sm" disabled={pending} className="w-full">
        {pending ? "Loading range…" : "Apply dates"}
      </Button>
    </form>
  );
}
