import type { Route } from "next";

/**
 * Where the strength programme's own pages are, for the flow they are opened in: setup's last
 * step while the account is being set up, and Plan once it is (each page lives under the tab
 * that owns it, owner, 20 October 2026). A draft is `${base}/drafts/[id]` in both; a request and
 * the builder have their own names under Plan.
 */
export type ProgrammeBase = "/welcome/programme" | "/plan";

/** A request to the coach, while it is being written and after. */
export function requestPath(base: ProgrammeBase, id: string): Route {
  return (base === "/plan" ? `/plan/requests/${id}` : `${base}/jobs/${id}`) as Route;
}

/** The strength programme's builder: `?draft=` reopens a draft, `?mode=` starts a new one. */
export function builderPath(base: ProgrammeBase, query = ""): Route {
  return (base === "/plan" ? `/plan/strength/edit${query}` : `${base}/manual${query}`) as Route;
}

/**
 * The coach's questions for a new strength programme. Plan's is still Profile's page until it is
 * replaced; every other sport's are New programme's (`/plan/new?sport=…&method=coach`).
 */
export function coachQuestionsPath(base: ProgrammeBase): Route {
  return (base === "/plan" ? "/profile/programme/create" : `${base}/create`) as Route;
}
