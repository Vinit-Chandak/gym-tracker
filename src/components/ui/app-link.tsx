"use client";

import type { Route } from "next";
import NextLink, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";

function PendingNavigation() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span
      role="status"
      className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 bg-accent motion-safe:animate-pulse"
    >
      <span className="sr-only">Loading page…</span>
    </span>
  );
}

export default function AppLink<T extends string>({
  children,
  href,
  ...props
}: Omit<ComponentProps<typeof NextLink>, "href"> & { href: Route<T> }) {
  return (
    <NextLink href={href} {...props}>
      {children}
      <PendingNavigation />
    </NextLink>
  );
}
