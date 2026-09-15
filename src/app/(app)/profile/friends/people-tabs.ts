/**
 * The People box's two lists, and the `people` search parameter that names them. In a file
 * of its own, with no directive, because the page (a server component) reads it and the
 * box (a client component) renders it: a value exported from a "use client" module reaches
 * a server component as a client reference, not the value, in a production build.
 */
export type PeopleTab = "following" | "followers";
export const PEOPLE_TABS: readonly PeopleTab[] = ["following", "followers"];
