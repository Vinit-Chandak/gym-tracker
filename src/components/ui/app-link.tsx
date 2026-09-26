"use client";

import type { Route } from "next";
import NextLink, { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import { NavigationFeedback } from "@/components/shell/navigation-feedback";

function PendingNavigation({ href }: { href: string }) {
  const { pending } = useLinkStatus();
  return pending ? <NavigationFeedback href={href} /> : null;
}

type NextLinkProps = ComponentProps<typeof NextLink>;

type AppLinkProps<T extends string> = Omit<NextLinkProps, "href" | "prefetch"> & {
  href: Route<T>;
  /**
   * Next's own values, plus `"intent"`: nothing while the link scrolls past, and the loading
   * screen fetched the moment a finger or pointer lands on it, a beat before the tap completes.
   * For rows in long lists, where prefetching every row in view sent dozens of requests at once
   * (docs/audits/2026-09-25-db-round-trips.md) that competed with the tap itself.
   */
  prefetch?: NextLinkProps["prefetch"] | "intent";
};

/** A link that prefetches on touch or hover rather than on entering the viewport. */
function IntentLink<T extends string>({
  href,
  onPointerDown,
  onPointerEnter,
  ...props
}: Omit<NextLinkProps, "href" | "prefetch"> & { href: Route<T> }) {
  const router = useRouter();
  const warm = () => router.prefetch(href);
  return (
    <NextLink
      href={href}
      prefetch={false}
      onPointerDown={(event) => {
        warm();
        onPointerDown?.(event);
      }}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") warm();
        onPointerEnter?.(event);
      }}
      {...props}
    />
  );
}

export default function AppLink<T extends string>({
  children,
  href,
  prefetch,
  ...props
}: AppLinkProps<T>) {
  const content = (
    <>
      {children}
      <PendingNavigation href={href} />
    </>
  );
  return prefetch === "intent" ? (
    <IntentLink href={href} {...props}>
      {content}
    </IntentLink>
  ) : (
    <NextLink href={href} prefetch={prefetch} {...props}>
      {content}
    </NextLink>
  );
}
