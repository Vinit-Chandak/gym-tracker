import { notFound } from "next/navigation";
import { z } from "zod";

const uuid = z.uuid();

/**
 * Every dynamic route segment in this app is a UUID. A malformed one is a bad URL,
 * not a server fault: left unchecked it reaches Postgres, which rejects the cast and
 * surfaces as "Something went wrong" instead of the not-found screen.
 */
export function requireUuid(value: string): string {
  if (!uuid.safeParse(value).success) notFound();
  return value;
}
