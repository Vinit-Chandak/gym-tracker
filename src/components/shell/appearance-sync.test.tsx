// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import {
  APPEARANCE_ATTRIBUTE,
  APPEARANCE_STORAGE_KEY,
  CANVAS_DARK,
  CANVAS_LIGHT,
  chooseAppearance,
} from "@/lib/appearance";
import { AppearanceRow } from "./appearance-row";
import { AppearanceSync } from "./appearance-sync";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  chooseAppearance("system");
  localStorage.clear();
  document.head.innerHTML = "";
});

function renderAppearance() {
  return render(
    <>
      <AppearanceSync />
      <AppearanceRow />
    </>,
  );
}

it("keeps a storage-blocked choice and its label through navigation metadata updates", async () => {
  renderAppearance();
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new DOMException("Storage is full", "QuotaExceededError");
  });
  act(() => chooseAppearance("dark"));
  expect(screen.getByRole("button", { name: "Appearance: Dark" })).toBeTruthy();
  expect(document.documentElement.getAttribute(APPEARANCE_ATTRIBUTE)).toBe("dark");

  await act(async () => {
    document.head.innerHTML = `<meta name="theme-color" media="(prefers-color-scheme: light)" content="${CANVAS_LIGHT}">`;
  });
  expect(document.documentElement.getAttribute(APPEARANCE_ATTRIBUTE)).toBe("dark");
  expect(document.head.querySelector<HTMLMetaElement>("meta")?.content).toBe(CANVAS_DARK);
  expect(screen.getByRole("button", { name: "Appearance: Dark" })).toBeTruthy();
});

it("updates both palette and label when another tab changes or clears the preference", () => {
  renderAppearance();
  act(() => {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, "dark");
    window.dispatchEvent(new StorageEvent("storage", { key: APPEARANCE_STORAGE_KEY }));
  });
  expect(document.documentElement.getAttribute(APPEARANCE_ATTRIBUTE)).toBe("dark");
  expect(screen.getByRole("button", { name: "Appearance: Dark" })).toBeTruthy();

  act(() => {
    localStorage.clear();
    window.dispatchEvent(new StorageEvent("storage", { key: null }));
  });
  expect(document.documentElement.hasAttribute(APPEARANCE_ATTRIBUTE)).toBe(false);
  expect(screen.getByRole("button", { name: "Appearance: System" })).toBeTruthy();
});
