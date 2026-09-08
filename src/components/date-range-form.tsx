"use client";

import { useRouter, usePathname } from "next/navigation";
import { useTransition } from "react";
import type { Route } from "next";
import { Button } from "./ui/button";
import { Input, Field } from "./ui/input";

export function DateRangeForm({ from, to }: { from: string; to: string }) {
  const router = useRouter(),
    pathname = usePathname();
  const [pending, startTransition] = useTransition();
  return (
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
      className="space-y-3"
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
  );
}
