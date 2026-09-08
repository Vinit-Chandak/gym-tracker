"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import type { Route } from "next";
import { Button } from "./ui/button";
import { Input, Field } from "./ui/input";
import { formatIsoDate } from "@/lib/format";

/**
 * Collapsed to a one-line summary by default: the range is worth seeing on every visit,
 * but the two date inputs and their button cost a fifth of a phone screen above the
 * content people actually came for.
 */
export function DateRangeForm({ from, to }: { from: string; to: string }) {
  const router = useRouter(),
    pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
    <details className="group">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 select-none">
        <span className="text-sm">
          <span className="text-ink-muted">Range </span>
          <span className="font-medium">
            {formatIsoDate(from)} – {formatIsoDate(to)}
          </span>
        </span>
        <span className="text-sm text-accent group-open:hidden">Change</span>
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const params = new URLSearchParams({
            from: String(data.get("from")),
            to: String(data.get("to")),
          });
          startTransition(() => router.push(`${pathname}?${params}` as Route));
        }}
        className="mt-3 space-y-3"
      >
        <div className="grid grid-cols-2 gap-3">
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
    </details>
  );
}
