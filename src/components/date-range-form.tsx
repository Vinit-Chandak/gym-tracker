"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";
import type { Route } from "next";
import { Button } from "./ui/button";
import { Input, Field } from "./ui/input";
import { formatDateRange } from "@/lib/format";

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
    <details className="group border-y border-line">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 py-2 select-none">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          <CalendarRange className="size-4 shrink-0 text-ink-muted" aria-hidden />
          <span className="sr-only">Date range: </span>
          <span className="font-medium">{formatDateRange(from, to)}</span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-ink-muted transition-transform duration-[var(--ov-duration-feedback)] group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          const params = new URLSearchParams(window.location.search);
          params.set("from", String(data.get("from")));
          params.set("to", String(data.get("to")));
          startTransition(() => router.push(`${pathname}?${params}` as Route));
        }}
        className="space-y-3 pt-1 pb-3"
      >
        <div className="grid gap-3 min-[360px]:grid-cols-2">
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
