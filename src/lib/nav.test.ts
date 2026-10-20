import { expect, it } from "vitest";
import {
  isNavItemActive,
  NAV_ITEMS,
  NAV_ORIGINS,
  originPath,
  originQuery,
  parseOrigin,
  sectionLabel,
  workoutBackPath,
  workoutOrigin,
  type NavOrigin,
} from "./nav";

it.each([
  ["/today", "/today"],
  ["/workouts/session/check-in", "/today"],
  // The check-in before a workout, which has no session yet, is Today's too.
  ["/workouts/start", "/today"],
  // A record opened with no origin is History's, inside Progress, as its Back is (NAV-03).
  ["/workouts/abc", "/progress"],
  ["/progress/activities/abc", "/progress"],
  // Gyms left the tab bar; its screens keep Profile selected, the way it is reached.
  ["/gyms", "/profile"],
  ["/gyms/gym/equipment/new", "/profile"],
  ["/exercises", "/profile"],
  ["/exercises/bench", "/profile"],
  // The strength programme's builder, drafts, requests and history are Plan's, under its path.
  ["/plan/strength/edit", "/plan"],
  ["/plan/drafts/abc", "/plan"],
  ["/plan/drafts/abc/programme", "/plan"],
  ["/plan/requests/abc", "/plan"],
  ["/plan/history", "/plan"],
  ["/u/phani03", "/profile"],
  // A meal's page is the Food tab's; History is Progress's (ADRs 0034, 0045).
  ["/food", "/food"],
  ["/food/breakfast", "/food"],
  // So are My foods, a meal kept in it, and the targets (ADR 0035).
  ["/food/my-foods", "/food"],
  ["/food/my-foods/meals/new", "/food"],
  ["/food/targets", "/food"],
  ["/progress/history", "/progress"],
])("keeps one primary destination selected for %s", (pathname, expected) => {
  expect(
    NAV_ITEMS.filter(({ href }) => isNavItemActive(pathname, href)).map(({ href }) => href),
  ).toEqual([expected]);
});

it("does not match unrelated path prefixes", () => {
  expect(isNavItemActive("/plan-other", "/plan")).toBe(false);
});

it("names the section a detail screen was opened from", () => {
  expect(sectionLabel("/gyms/abc/equipment/new")).toBe("Gyms");
  expect(sectionLabel("/workouts/abc")).toBe("Workout");
  expect(sectionLabel("/profile")).toBe("Profile");
  // What AI coach opens goes back to it by name.
  expect(sectionLabel("/profile/ai-coach")).toBe("AI coach");
  expect(sectionLabel("/profile/ai-coach?tab=notes")).toBe("AI coach");
  // A person's page has no section name: "People" is another page, the list you follow them from.
  // What links to their page names them; Comparing with them is a page with a name of its own.
  expect(sectionLabel("/u/phani03")).toBeUndefined();
  expect(sectionLabel("/u/phani03/activities/abc")).toBeUndefined();
  expect(sectionLabel("/u/phani03/compare?sport=running")).toBe("Compare");
  expect(sectionLabel("/u/phani03/compare/bench")).toBe("Compare");
  expect(sectionLabel("/u/compare")).toBeUndefined();
  // A meal's page goes back to the Food tab.
  expect(sectionLabel("/food")).toBe("Food");
  // My foods is a screen of Food's with a name of its own (ADR 0035); Targets is Food's.
  expect(sectionLabel("/food/my-foods")).toBe("My foods");
  expect(sectionLabel("/food/targets")).toBe("Food");
  // History is a page of Progress's with a name of its own.
  expect(sectionLabel("/progress/history")).toBe("History");
  expect(sectionLabel("/progress/history?from=2026-09-01")).toBe("History");
  expect(sectionLabel("/progress?view=strength")).toBe("Progress");
  // A programme's page is named as its title is: what its session, days and changes go back to.
  expect(sectionLabel("/plan/running")).toBe("Running programme");
  expect(sectionLabel("/plan/strength?view=changes")).toBe("Strength programme");
  expect(sectionLabel("/plan/swimming")).toBe("Swimming programme");
  // Plan's other pages, and a programme's own pages, are Plan's.
  expect(sectionLabel("/plan/new?sport=running")).toBe("Plan");
  expect(sectionLabel("/plan/past")).toBe("Plan");
  expect(sectionLabel("/plan/strength/days/abc")).toBe("Plan");
  expect(sectionLabel("/plan/sessions/abc")).toBe("Plan");
  // Logging a run, ride or swim is Today's.
  expect(sectionLabel("/today/log/new?sport=running")).toBe("Today");
  // A logged run, ride or swim is named by the page linking back to it, never "Progress".
  expect(sectionLabel("/progress/activities/abc?from=history")).toBeUndefined();
  expect(sectionLabel("/progress/activities/abc/counts-as")).toBeUndefined();
});

it("has no section name for a path outside the primary sections", () => {
  expect(sectionLabel("/nowhere")).toBeUndefined();
});

it("puts Plan where Training and Runs were, and Food where History was", () => {
  expect(NAV_ITEMS.map((item) => item.href)).toEqual([
    "/today",
    "/plan",
    "/food",
    "/progress",
    "/profile",
  ]);
  // Still five tabs, and no separate Runs product among them (AT-NAV-01).
  expect(NAV_ITEMS.map((item) => item.label)).not.toContain("Runs");
  expect(NAV_ITEMS[1]?.label).toBe("Plan");
  // History is reached from Progress now (ADR 0034).
  expect(NAV_ITEMS.map((item) => item.label)).not.toContain("History");
});

it.each([
  ["/plan", "/plan"],
  ["/plan/running", "/plan"],
  ["/plan/new", "/plan"],
  // A scheduled session's page and a programme day are Plan's; logging a run is Today's.
  ["/plan/sessions/abc", "/plan"],
  ["/plan/strength/days/abc", "/plan"],
  ["/today/log/new", "/today"],
  // The session's own pages are Today's, where a workout is started and finished.
  ["/workouts/abc/check-in", "/today"],
  ["/workouts/abc/add-exercise", "/today"],
])("keeps one shared tab selected for %s", (pathname, expected) => {
  expect(
    NAV_ITEMS.filter(({ href }) => isNavItemActive(pathname, href)).map(({ href }) => href),
  ).toEqual([expected]);
});

it("accepts only the origins it knows, and never an arbitrary destination", () => {
  expect(parseOrigin("today")).toBe("today");
  expect(parseOrigin("programme")).toBe("programme");
  // A link written while Plan was Training still means Plan.
  expect(parseOrigin("training")).toBe("plan");
  expect(parseOrigin("https://example.test/steal")).toBeNull();
  expect(parseOrigin(["today", "history"])).toBeNull();
  expect(parseOrigin(undefined)).toBeNull();
  // A completed record with no stated origin belongs to History (NAV-03), inside Progress.
  expect(originPath(null)).toBe("/progress/history");
  expect(originPath(null, "plan")).toBe("/plan");
  expect(originPath("programme")).toBe("/plan");
});

it("sends a finished workout back to History unless its link names where it was opened", () => {
  expect(workoutBackPath(null, true)).toBe("/progress/history");
  expect(sectionLabel(workoutBackPath(null, true))).toBe("History");
  expect(workoutBackPath("today", true)).toBe("/today");
  expect(workoutBackPath("shared", true)).toBe("/profile/friends");
  // Opened from an exercise's page and loaded again, it goes back to Exercises, where that is.
  expect(sectionLabel(workoutBackPath("exercises", true))).toBe("Exercises");
  // The open workout is Today's, wherever it was opened from.
  expect(workoutBackPath(null, false)).toBe("/today");
  expect(workoutBackPath("history", false)).toBe("/today");
});

const selected = (pathname: string, origin: NavOrigin | null = null) =>
  NAV_ITEMS.filter(({ href }) => isNavItemActive(pathname, href, origin)).map(({ href }) => href);

it.each([null, ...NAV_ORIGINS])("lights the tab a record's Back leads into (%s)", (origin) => {
  // A finished workout and a logged run, ride or swim, with their link's origin or none.
  expect(selected("/workouts/abc", origin)).toEqual(selected(workoutBackPath(origin, true)));
  expect(selected("/progress/activities/abc", origin)).toEqual(selected(originPath(origin)));
  // A finished workout's edit's Add exercise keeps the tab the workout lit, its link naming none
  // included; the open workout's is Today's.
  expect(selected("/workouts/abc/add-exercise", workoutOrigin(origin, true))).toEqual(
    selected("/workouts/abc", origin),
  );
  expect(selected("/workouts/abc/add-exercise", workoutOrigin(null, false))).toEqual(["/today"]);
});

it.each<[string, NavOrigin, string]>([
  // A finished workout opened from History keeps History's tab, Progress, and so does its
  // exercise.
  ["/workouts/abc", "history", "/progress"],
  ["/progress/activities/abc", "history", "/progress"],
  // Correcting a run opened from History does not move you to Plan.
  ["/progress/activities/abc/edit", "history", "/progress"],
  ["/progress/activities/abc", "programme", "/plan"],
  // Opened from Today's card, a finished workout or a logged run keeps Today selected.
  ["/workouts/abc", "today", "/today"],
  ["/progress/activities/abc", "today", "/today"],
  // What it counts as is the record's too, under the tab it was opened from.
  ["/progress/activities/abc/counts-as", "today", "/today"],
  ["/workouts/abc", "shared", "/profile"],
  // Year audit, October 2026: a workout opened from an exercise's graph lit Progress while its
  // Back went to the exercise, which is Profile's. The exercise's tab stays selected.
  ["/workouts/abc", "exercises", "/profile"],
])("keeps %s under the tab its link names (%s)", (pathname, origin, expected) => {
  expect(
    NAV_ITEMS.filter(({ href }) => isNavItemActive(pathname, href, origin)).map(({ href }) => href),
  ).toEqual([expected]);
});

it.each([
  ["/today", "/today"],
  ["/progress", "/progress"],
  ["/food", "/food"],
  ["/plan/strength/edit", "/plan"],
  ["/plan/sessions/abc", "/plan"],
  // The form says where it was opened from, but logging is Today's however it was reached.
  ["/today/log/new", "/today"],
  ["/exercises/bench", "/profile"],
])("lets only a record take an origin, never %s", (pathname, expected) => {
  expect(
    NAV_ITEMS.filter(({ href }) => isNavItemActive(pathname, href, "history")).map(
      ({ href }) => href,
    ),
  ).toEqual([expected]);
});

it("names an origin on a record's link that the record reads back", () => {
  expect(originQuery("history")).toBe("?from=history");
  expect(originQuery(null)).toBe("");
  const query = new URLSearchParams(originQuery("history"));
  expect(parseOrigin(query.get("from") ?? undefined)).toBe("history");
  // History's own `from` is a date, which is no origin at all.
  expect(parseOrigin("2026-09-01")).toBeNull();
});
