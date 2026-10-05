// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { STANDALONE_ATTRIBUTE } from "@/lib/platform";

import { ViewportSettle } from "./viewport-settle";

const scrollTo = vi.fn();

function viewportOf(height: number) {
  Object.defineProperty(window, "innerHeight", { configurable: true, value: height });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "requestAnimationFrame"] });
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
  document.documentElement.setAttribute(STANDALONE_ATTRIBUTE, "");
  viewportOf(874);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  scrollTo.mockReset();
  document.documentElement.removeAttribute(STANDALONE_ATTRIBUTE);
  delete (navigator as { standalone?: boolean }).standalone;
  document.body.innerHTML = "";
});

it("asks WebKit to measure again when the keyboard leaves the installed app short", () => {
  render(<ViewportSettle />);
  // The keyboard went down, and iOS gave back a viewport one status bar short.
  viewportOf(812);
  document.dispatchEvent(new FocusEvent("focusout"));
  vi.advanceTimersByTime(120);
  expect(scrollTo).toHaveBeenCalledWith(0, 1);
  vi.advanceTimersByTime(40);
  expect(scrollTo).toHaveBeenLastCalledWith(0, 0);
});

it("leaves a viewport that came back whole alone", () => {
  render(<ViewportSettle />);
  viewportOf(812);
  window.dispatchEvent(new Event("resize"));
  viewportOf(874);
  document.dispatchEvent(new FocusEvent("focusout"));
  vi.advanceTimersByTime(1000);
  expect(scrollTo).not.toHaveBeenCalled();
});

it("expects a short viewport while something is being typed", () => {
  render(<ViewportSettle />);
  const input = document.createElement("input");
  document.body.append(input);
  input.focus();
  viewportOf(500);
  window.dispatchEvent(new Event("resize"));
  vi.advanceTimersByTime(1000);
  expect(scrollTo).not.toHaveBeenCalled();
});

it("does nothing in a browser tab", () => {
  document.documentElement.removeAttribute(STANDALONE_ATTRIBUTE);
  render(<ViewportSettle />);
  viewportOf(700);
  document.dispatchEvent(new FocusEvent("focusout"));
  vi.advanceTimersByTime(1000);
  expect(scrollTo).not.toHaveBeenCalled();
});
