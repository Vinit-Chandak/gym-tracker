// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { PLATFORM_ATTRIBUTE } from "@/lib/platform";

import { InstallSection } from "./install-row";
import { PwaProvider } from "./pwa-provider";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1";
const PIXEL =
  "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36";
const DESKTOP =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function browser(userAgent: string) {
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: userAgent });
  if (userAgent === PIXEL) document.documentElement.setAttribute(PLATFORM_ATTRIBUTE, "android");
}

beforeEach(() => {
  // A browser tab, not the installed app.
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, "close", {
    configurable: true,
    value: function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    },
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "userAgent");
  Reflect.deleteProperty(navigator, "getInstalledRelatedApps");
  document.documentElement.removeAttribute(PLATFORM_ATTRIBUTE);
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

const install = () =>
  render(
    <PwaProvider>
      <InstallSection />
    </PwaProvider>,
  );

async function openInstructions() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Install Overload" }));
  });
}

it("gives an iPhone only Safari's steps, as Safari 26 lays them out", async () => {
  browser(IPHONE);
  install();
  await openInstructions();
  expect(screen.getByText("iPhone and iPad")).toBeTruthy();
  expect(screen.getByText(/Safari menu ••• → Share → Add to Home Screen/)).toBeTruthy();
  expect(screen.queryByText("Android")).toBeNull();
});

it("gives an Android phone only Chrome's steps", async () => {
  browser(PIXEL);
  install();
  await openInstructions();
  expect(screen.getByText("Android")).toBeTruthy();
  expect(screen.queryByText("iPhone and iPad")).toBeNull();
});

it("gives both where the platform is neither", async () => {
  browser(DESKTOP);
  install();
  await openInstructions();
  expect(screen.getByText("Android")).toBeTruthy();
  expect(screen.getByText("iPhone and iPad")).toBeTruthy();
});

it("stops offering to install an app the browser says is already installed", async () => {
  browser(PIXEL);
  Object.defineProperty(navigator, "getInstalledRelatedApps", {
    configurable: true,
    value: vi.fn().mockResolvedValue([{ platform: "webapp", url: "/manifest.webmanifest" }]),
  });
  install();
  await act(async () => {});
  expect(screen.queryByRole("button", { name: "Install Overload" })).toBeNull();
});

it("keeps offering it where the browser cannot tell", async () => {
  browser(PIXEL);
  Object.defineProperty(navigator, "getInstalledRelatedApps", {
    configurable: true,
    value: vi.fn().mockResolvedValue([]),
  });
  install();
  await act(async () => {});
  expect(screen.getByRole("button", { name: "Install Overload" })).toBeTruthy();
});
