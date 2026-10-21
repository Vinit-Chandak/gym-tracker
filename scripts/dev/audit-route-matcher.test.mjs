import assert from "node:assert/strict";
import { test } from "node:test";

import { createRouteMatcher, isSuccessfulScreenVisit } from "./audit-route-matcher.mjs";

test("literal pages cannot stand in for unvisited dynamic screens", () => {
  const match = createRouteMatcher([
    "/exercises/[exerciseId]",
    "/exercises/new",
    "/food/[meal]",
    "/food/targets",
    "/food/my-foods",
    "/food/my-foods/meals/[id]",
    "/food/my-foods/meals/new",
    "/plan/[sport]",
    "/plan/new",
    "/plan/past",
    "/plan/history",
    "/workouts/[sessionId]",
    "/workouts/start",
  ]);
  for (const literal of [
    "/exercises/new",
    "/food/targets",
    "/food/my-foods",
    "/food/my-foods/meals/new",
    "/plan/new",
    "/plan/past",
    "/plan/history",
    "/workouts/start",
  ]) {
    assert.equal(match(literal), literal);
  }
  assert.equal(match("/exercises/bench-press"), "/exercises/[exerciseId]");
  assert.equal(match("/food/breakfast"), "/food/[meal]");
  assert.equal(match("/food/my-foods/meals/meal-123"), "/food/my-foods/meals/[id]");
  assert.equal(match("/plan/running"), "/plan/[sport]");
  assert.equal(match("/workouts/session-123"), "/workouts/[sessionId]");
  assert.equal(match("/food/missing/child"), null);
});

test("route precedence is decided at the first different segment", () => {
  const match = createRouteMatcher(["/a/[id]/edit", "/a/new/[tab]", "/a/[...rest]"]);
  assert.equal(match("/a/new/edit"), "/a/new/[tab]");
  assert.equal(match("/a/123/edit"), "/a/[id]/edit");
  assert.equal(match("/a/123/notes/extra"), "/a/[...rest]");
});

test("expected not-found screens never count as rendered pages, including streamed HTTP 200", () => {
  const clean = { status: 200, errors: [], accessibility: [], overflow: false };
  assert.equal(isSuccessfulScreenVisit(clean), true);
  assert.equal(isSuccessfulScreenVisit({ ...clean, expectedNotFound: true }), false);
  assert.equal(isSuccessfulScreenVisit({ ...clean, status: 404, expectedNotFound: true }), false);
  assert.equal(isSuccessfulScreenVisit({ ...clean, unexpectedNotFound: true }), false);
  assert.equal(isSuccessfulScreenVisit({ ...clean, unexpectedDestination: true }), false);
});

test("streamed error boundaries fail coverage even without an uncaught browser error", () => {
  const clean = {
    route: "/food",
    url: "http://localhost:3110/food",
    status: 200,
    errors: [],
    accessibility: [],
  };
  assert.equal(isSuccessfulScreenVisit({ ...clean, errorScreen: true }), false);
  assert.equal(isSuccessfulScreenVisit({ ...clean, unexpectedErrorScreen: true }), false);
  for (const explanation of [
    "The page could not load. Retry to fetch it again.",
    "The app could not start. Reload to try again.",
    "You’re offline. Reconnect and reload.",
  ]) {
    assert.equal(
      isSuccessfulScreenVisit({
        ...clean,
        text: `Today\nSomething went wrong\n${explanation}\nBack to Today`,
      }),
      false,
    );
  }
  assert.equal(
    isSuccessfulScreenVisit({
      ...clean,
      text: "Notes\nSomething went wrong\nI changed my workout.",
    }),
    true,
  );
});

test("only the intended error preview may render the error boundary successfully", () => {
  const preview = {
    route: "/preview/error?state=online",
    url: "http://localhost:3111/preview/error?state=online",
    status: 200,
    errors: [],
    accessibility: [],
    errorScreen: true,
  };
  assert.equal(isSuccessfulScreenVisit(preview), true);
  assert.equal(isSuccessfulScreenVisit({ ...preview, route: "/food" }), false);
  assert.equal(isSuccessfulScreenVisit({ ...preview, url: "http://localhost:3110/food" }), false);
  assert.equal(
    isSuccessfulScreenVisit({ ...preview, route: "/preview/error/other", url: undefined }),
    false,
  );
});
