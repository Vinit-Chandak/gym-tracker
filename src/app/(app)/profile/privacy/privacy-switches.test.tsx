// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setPrivacyAction } from "@/server/actions/privacy";
import { setSportSharingAction } from "@/server/actions/sport-preferences";
import { PrivacySwitches } from "./privacy-switches";

vi.mock("@/server/actions/privacy", () => ({ setPrivacyAction: vi.fn() }));
vi.mock("@/server/actions/sport-preferences", () => ({ setSportSharingAction: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const VALUES = {
  followApproval: true,
  shareTraining: true,
  shareBodyWeight: false,
  discoverableByEmail: false,
};

const checked = (name: string) => screen.getByRole("switch", { name }).getAttribute("aria-checked");

it("lets the athlete opt into each additional sport independently", async () => {
  vi.mocked(setSportSharingAction).mockResolvedValue();
  render(<PrivacySwitches values={VALUES} sports={{ cycling: false, swimming: false }} />);
  fireEvent.click(screen.getByRole("switch", { name: "Share swimming with followers" }));
  await waitFor(() => expect(setSportSharingAction).toHaveBeenCalledWith("swimming", true));
  expect(checked("Share cycling with followers")).toBe("false");
});

it("rolls the switch back and reports an unsuccessful save", async () => {
  vi.mocked(setSportSharingAction).mockRejectedValue(new TypeError("Failed to fetch"));
  render(<PrivacySwitches values={VALUES} sports={{ cycling: true, swimming: false }} />);
  fireEvent.click(screen.getByRole("switch", { name: "Share cycling with followers" }));
  await screen.findByRole("alert");
  expect(checked("Share cycling with followers")).toBe("true");
});

it("offers a switch only for the additional sports given, and none when there are none", () => {
  // Swimming turned off and not shared: the page leaves it out, and no switch is drawn for it.
  render(<PrivacySwitches values={VALUES} sports={{ cycling: false }} />);
  expect(screen.getByRole("switch", { name: "Share cycling with followers" })).toBeTruthy();
  expect(screen.queryByRole("switch", { name: "Share swimming with followers" })).toBeNull();
  // What a shared ride says is the promise's, behind What a follower can see, not a footnote.
  expect(screen.queryByText(/date, duration/)).toBeNull();
  cleanup();
  render(<PrivacySwitches values={VALUES} />);
  expect(screen.getAllByRole("switch")).toHaveLength(4);
});

it("says under each switch, in eight words at most, only what the label does not", () => {
  render(<PrivacySwitches values={VALUES} sports={{ cycling: false }} />);
  // Running shares with lifting (SOCIAL-02), so the training switch says so.
  const lines = [
    "Off: anyone can follow you.",
    "Lifting and running. Off: just your profile card.",
    // A ratio's sharing says what it shows: your weight, the same in pounds or kilograms.
    "On: followers who share theirs see your weight.",
    "Off: only username search finds you.",
  ];
  for (const line of lines) {
    expect(screen.getByText(line)).toBeTruthy();
    expect(line.split(/\s+/).length).toBeLessThanOrEqual(8);
  }
  expect(screen.queryByText(/per kg/)).toBeNull();
  // Shared training on, a sport's own switch has nothing to add.
  expect(screen.queryByText("Needs Share training")).toBeNull();
});

it("dims a sport's own switch while training is not shared, and still lets it change", async () => {
  vi.mocked(setPrivacyAction).mockResolvedValue();
  vi.mocked(setSportSharingAction).mockResolvedValue();
  render(
    <PrivacySwitches
      values={{ ...VALUES, shareTraining: false }}
      sports={{ cycling: true, swimming: false }}
    />,
  );
  expect(screen.getAllByText("Needs Share training")).toHaveLength(2);
  // Kept private before training is shared, never after: the dimmed switch still works.
  fireEvent.click(screen.getByRole("switch", { name: "Share cycling with followers" }));
  await waitFor(() => expect(setSportSharingAction).toHaveBeenCalledWith("cycling", false));
  // Training shared, the sports' switches say nothing more.
  fireEvent.click(screen.getByRole("switch", { name: "Share training with followers" }));
  await waitFor(() => expect(setPrivacyAction).toHaveBeenCalledWith("shareTraining", true));
  await waitFor(() => expect(screen.queryAllByText("Needs Share training")).toHaveLength(0));
});

it("holds the sports' switches again when sharing training does not save", async () => {
  vi.mocked(setPrivacyAction).mockRejectedValue(new TypeError("Failed to fetch"));
  render(
    <PrivacySwitches values={{ ...VALUES, shareTraining: false }} sports={{ cycling: false }} />,
  );
  fireEvent.click(screen.getByRole("switch", { name: "Share training with followers" }));
  await screen.findByRole("alert");
  expect(checked("Share training with followers")).toBe("false");
  expect(screen.getByText("Needs Share training")).toBeTruthy();
});
