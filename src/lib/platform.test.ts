// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TEXT_SIZE_INIT_SCRIPT } from "./platform";

/** iOS's body text size at the reader's setting: 17 pt is the standard one. */
let body = 17;

beforeEach(() => {
  vi.stubGlobal(
    "getComputedStyle",
    (element: Element) =>
      ({ fontSize: element.tagName === "SPAN" ? `${body}px` : "16px" }) as CSSStyleDeclaration,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete (navigator as { standalone?: boolean }).standalone;
  document.documentElement.style.removeProperty("font-size");
  body = 17;
});

function installed() {
  Object.defineProperty(navigator, "standalone", { configurable: true, value: true });
}
const run = () => new Function(TEXT_SIZE_INIT_SCRIPT)();
const root = () => document.documentElement.style.fontSize;

describe("the reader's text size in the app installed on iOS", () => {
  it("keeps the designed size at the standard setting", () => {
    installed();
    run();
    expect(root()).toBe("");
    // The probe is measured and gone.
    expect(document.querySelector("span")).toBeNull();
  });

  it("grows the root in step with a larger setting", () => {
    installed();
    body = 21; // Extra Extra Large
    run();
    expect(parseFloat(root())).toBeCloseTo((16 * 21) / 17, 5);
  });

  it("stops at 200%, the largest the layouts are drawn for", () => {
    installed();
    body = 53; // the largest accessibility size
    run();
    expect(root()).toBe("32px");
  });

  it("never draws smaller than the design", () => {
    installed();
    body = 14; // Extra Small
    run();
    expect(root()).toBe("");
  });

  it("reads the setting again when the app comes back", () => {
    installed();
    run();
    body = 23;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(parseFloat(root())).toBeCloseTo((16 * 23) / 17, 5);
    body = 17;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(root()).toBe("");
  });

  it("leaves a browser tab to the browser's own text size", () => {
    body = 23;
    run();
    expect(root()).toBe("");
  });
});
