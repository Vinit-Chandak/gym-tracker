"use client";

import type { Route } from "next";
import NextLink, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { NavigationFeedback } from "@/components/shell/navigation-feedback";

function PendingNavigation({ href }: { href: string }) {
  const { pending } = useLinkStatus();
  return pending ? <NavigationFeedback href={href} /> : null;
}

export default function AppLink<T extends string>({
  children,
  href,
  ...props
}: Omit<ComponentProps<typeof NextLink>, "href"> & { href: Route<T> }) {
  return (
    <NextLink href={href} {...props}>
      {children}
      <PendingNavigation href={href} />
    </NextLink>
  );
}
