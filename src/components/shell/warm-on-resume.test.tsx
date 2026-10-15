// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { RESUME_AFTER_MS, WARM_AGAIN_AFTER_MS, WarmOnResume } from "./warm-on-resume";

let visibility: DocumentVisibilityState = "visible";
const fetch = vi.fn(async () => new Response(null));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-09T07:00:00Z"));
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
  vi.stubGlobal("fetch", fetch);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  fetch.mockClear();
});

function showAfter(ms: number) {
  visibility = "hidden";
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  act(() => vi.advanceTimersByTime(ms));
  visibility = "visible";
  act(() => document.dispatchEvent(new Event("visibilitychange")));
}

it("warms the server when the app is shown again after a break", () => {
  render(<WarmOnResume />);
  showAfter(RESUME_AFTER_MS);
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/warm", { method: "HEAD", cache: "no-store" });
});

it("leaves a quick glance away alone", () => {
  render(<WarmOnResume />);
  showAfter(RESUME_AFTER_MS - 1);
  expect(fetch).not.toHaveBeenCalled();
});

it("does not try while offline", () => {
  vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
  render(<WarmOnResume />);
  showAfter(RESUME_AFTER_MS * 10);
  expect(fetch).not.toHaveBeenCalled();
});

it("warms when the connection comes back, at most once a minute", () => {
  render(<WarmOnResume />);
  act(() => window.dispatchEvent(new Event("online")));
  act(() => window.dispatchEvent(new Event("online")));
  expect(fetch).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(WARM_AGAIN_AFTER_MS - 1));
  act(() => window.dispatchEvent(new Event("online")));
  expect(fetch).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(1));
  act(() => window.dispatchEvent(new Event("online")));
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("is not held up by a warm-up that never answered", () => {
  fetch.mockImplementationOnce(() => new Promise(() => {}));
  render(<WarmOnResume />);
  showAfter(RESUME_AFTER_MS);
  showAfter(RESUME_AFTER_MS);
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("ignores the connection returning while the app is out of sight", () => {
  render(<WarmOnResume />);
  visibility = "hidden";
  act(() => window.dispatchEvent(new Event("online")));
  expect(fetch).not.toHaveBeenCalled();
});

it("counts the break from when an app opened in the background was first hidden", () => {
  visibility = "hidden";
  render(<WarmOnResume />);
  act(() => vi.advanceTimersByTime(RESUME_AFTER_MS));
  visibility = "visible";
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(fetch).toHaveBeenCalledOnce();
});
