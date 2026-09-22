// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setSportSharingAction } from "@/server/actions/sport-preferences";
import { SportSharingSwitches } from "./privacy-switches";

vi.mock("@/server/actions/privacy", () => ({ setPrivacyAction: vi.fn() }));
vi.mock("@/server/actions/sport-preferences", () => ({ setSportSharingAction: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

it("lets the athlete opt into each additional sport independently", async () => {
  vi.mocked(setSportSharingAction).mockResolvedValue();
  render(<SportSharingSwitches values={{ cycling: false, swimming: false }} />);
  fireEvent.click(screen.getByRole("switch", { name: "Share swimming with followers" }));
  await waitFor(() => expect(setSportSharingAction).toHaveBeenCalledWith("swimming", true));
  expect(
    screen
      .getByRole("switch", { name: "Share cycling with followers" })
      .getAttribute("aria-checked"),
  ).toBe("false");
});

it("rolls the switch back and reports an unsuccessful save", async () => {
  vi.mocked(setSportSharingAction).mockRejectedValue(new TypeError("Failed to fetch"));
  render(<SportSharingSwitches values={{ cycling: true, swimming: false }} />);
  fireEvent.click(screen.getByRole("switch", { name: "Share cycling with followers" }));
  await screen.findByRole("alert");
  expect(
    screen
      .getByRole("switch", { name: "Share cycling with followers" })
      .getAttribute("aria-checked"),
  ).toBe("true");
});
