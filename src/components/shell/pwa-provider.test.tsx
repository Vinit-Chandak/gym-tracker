// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PwaProvider, useInstallPrompt } from "./pwa-provider";

afterEach(cleanup);
function Install() {
  const { available, installed, install } = useInstallPrompt();
  return (
    <button disabled={!available || installed} onClick={() => void install()}>
      Install
    </button>
  );
}

it("retains the browser prompt until the user reaches Profile, and consumes it once", async () => {
  const view = render(
    <PwaProvider>
      <div>Today</div>
    </PwaProvider>,
  );
  const prompt = vi.fn().mockResolvedValue(undefined);
  const event = new Event("beforeinstallprompt", { cancelable: true });
  Object.assign(event, { prompt });
  act(() => {
    window.dispatchEvent(event);
  });
  expect(event.defaultPrevented).toBe(true);
  view.rerender(
    <PwaProvider>
      <Install />
    </PwaProvider>,
  );
  const button = screen.getByRole("button", { name: "Install" }) as HTMLButtonElement;
  expect(button.disabled).toBe(false);
  await act(async () => {
    fireEvent.click(button);
  });
  expect(prompt).toHaveBeenCalledOnce();
  expect(button.disabled).toBe(true);
});

it("handles prompt rejection and appinstalled without an unhandled error", async () => {
  render(
    <PwaProvider>
      <Install />
    </PwaProvider>,
  );
  const event = Object.assign(new Event("beforeinstallprompt"), {
    prompt: vi.fn().mockRejectedValue(new Error("Dismissed")),
  });
  act(() => {
    window.dispatchEvent(event);
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button"));
  });
  act(() => {
    window.dispatchEvent(new Event("appinstalled"));
  });
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
});
