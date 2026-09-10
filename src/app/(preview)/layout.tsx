import { notFound } from "next/navigation";
import type { ReactNode } from "react";

/**
 * The shell, without the account behind it.
 *
 * Every real screen sits behind sign-in and a database, so the only way to look at a change to
 * the navigation or to Today has been to deploy it and then train. This group renders the same
 * components against made-up data, so the island, the day's cards and the set grid can be seen
 * — on a phone, in both palettes — before anything ships.
 *
 * Development only, enforced here rather than by convention: in a production build these routes
 * are not found. Nothing under it reads or writes anything belonging to a person.
 */
export default function PreviewLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound();
  return <div className="flex min-h-dvh flex-col">{children}</div>;
}
