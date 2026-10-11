// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setSportSharingAction } from "@/server/actions/sport-preferences";
import { PrivacySwitches, SportSharingSwitches } from "./privacy-switches";

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

it("offers a switch only for the additional sports given, and says what one shares", () => {
  // Swimming turned off and not shared: the page leaves it out, and no switch is drawn for it.
  render(<SportSharingSwitches values={{ cycling: false }} />);
  expect(screen.getByRole("switch", { name: "Share cycling with followers" })).toBeTruthy();
  expect(screen.queryByRole("switch", { name: "Share swimming with followers" })).toBeNull();
  expect(screen.getByText(/A shared ride says its date, duration and known distance/)).toBeTruthy();
  cleanup();
  const { container } = render(<SportSharingSwitches values={{}} />);
  expect(container.innerHTML).toBe("");
});

it("says that running shares with lifting, since it has no switch of its own", () => {
  render(
    <PrivacySwitches
      values={{
        followApproval: true,
        shareTraining: true,
        shareBodyWeight: false,
        discoverableByEmail: false,
      }}
    />,
  );
  expect(screen.getByText(/^Your lifting and running; rides and swims also need/)).toBeTruthy();
});
