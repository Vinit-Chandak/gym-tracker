/**
 * The programme's two tabs, and the `view` search parameter that names them. In a file of its
 * own, with no directive, because the page (a server component) reads it and the tab strip (a
 * client component) renders it: a value exported from a "use client" module reaches a server
 * component as a client reference, not the value, in a production build.
 */
export type ProgrammeView = "cycle" | "changes";
export const PROGRAMME_VIEWS: readonly ProgrammeView[] = ["cycle", "changes"];
