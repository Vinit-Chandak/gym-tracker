// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.mock("@/server/actions/onboarding", () => ({ addStarterEquipmentAction: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => {} }));

import { EquipmentStepForm } from "./equipment-step-form";
import { previewMachinesStep } from "./preview-step";

beforeEach(() => {
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
      this.dispatchEvent(new Event("close"));
    },
  });
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

const ART = { leg_press_45: "/equipment-art/leg_press_45.svg?v=1", cable_station: "/c.svg" };

function show(step = previewMachinesStep("gym", "new")) {
  const { container } = render(<EquipmentStepForm step={step} art={ART} />);
  const sent = () => {
    const data = new FormData(container.querySelector("form")!);
    return {
      typeIds: data.getAll("typeId"),
      combinationIds: data.getAll("combinationId"),
      notHere: data.getAll("notHereTypeId"),
    };
  };
  return { container, sent };
}

it("shows a beginner at a gym the basics as one line, then a handful of extras to tick", () => {
  const { sent } = show();
  const review = screen.getByRole("button", { name: "Review the 18 usually here" });
  expect(review.textContent).toContain("Usually here (18)");
  expect(review.textContent).toContain(
    "Barbell, EZ curl bar, dumbbells, weight plates and 14 more",
  );
  const extras = within(screen.getByRole("region", { name: "What else is here?" }));
  const tiles = extras.getAllByRole("checkbox");
  expect(tiles.length).toBeGreaterThanOrEqual(8);
  expect(tiles.length).toBeLessThanOrEqual(12);
  expect(tiles.every((tile) => !(tile as HTMLInputElement).checked)).toBe(true);
  expect(screen.queryByRole("button", { name: /select all/i })).toBeNull();
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(sent()).toEqual({ typeIds: [], combinationIds: [], notHere: [] });
  fireEvent.click(extras.getByRole("checkbox", { name: /Hack squat/ }));
  fireEvent.click(extras.getByRole("checkbox", { name: /Assisted dip and chin/ }));
  expect(sent()).toEqual({
    typeIds: ["hack_squat"],
    combinationIds: ["assisted_dip_chin"],
    notHere: [],
  });
  expect(screen.getByRole("button", { name: "Add 2 and continue" })).toBeTruthy();
});

it("records a basic as not here from its Review, and counts what is left", () => {
  const { sent } = show();
  fireEvent.click(screen.getByRole("button", { name: "Review the 18 usually here" }));
  const sheet = within(screen.getByRole("dialog", { name: "Usually here" }));
  const pecDeck = sheet.getByRole("checkbox", { name: /Pec deck/ }) as HTMLInputElement;
  expect(pecDeck.checked).toBe(true);
  fireEvent.click(pecDeck);
  fireEvent.click(sheet.getByRole("button", { name: "Done" }));
  expect(sent().notHere).toEqual(["pec_deck"]);
  const line = screen.getByRole("button", { name: "Review the 17 usually here" });
  expect(line.textContent).toContain("Not here: pec deck");
});

it("asks which variant a family is, and registers nothing when the answer is Not sure", () => {
  const { sent } = show();
  const extras = within(screen.getByRole("region", { name: "What else is here?" }));
  fireEvent.click(extras.getByRole("checkbox", { name: /^Chest press/ }));
  let sheet = within(screen.getByRole("dialog", { name: "Which chest press?" }));
  fireEvent.click(sheet.getByRole("button", { name: "Not sure" }));
  expect(sent().typeIds).toEqual([]);
  fireEvent.click(extras.getByRole("checkbox", { name: /^Chest press/ }));
  sheet = within(screen.getByRole("dialog", { name: "Which chest press?" }));
  fireEvent.click(sheet.getByRole("button", { name: /Iso-lateral/ }));
  expect(sent().typeIds).toEqual(["iso_lateral_press"]);
  const tile = extras.getByRole("checkbox", { name: /^Chest press/ }) as HTMLInputElement;
  expect(tile.checked).toBe(true);
  expect(tile.closest("label")!.textContent).toContain("Iso-lateral");
});

it("gives somebody who already trains every other type, searchable by any of its names", () => {
  const { sent } = show(previewMachinesStep("gym", "experienced"));
  expect(screen.getByRole("button", { name: "Review the 18 usually here" })).toBeTruthy();
  expect(screen.queryByRole("region", { name: "What else is here?" })).toBeNull();
  // The basics are on their line, not in the list; nothing is ticked to begin with.
  expect(screen.queryByRole("checkbox", { name: /^Pec deck/ })).toBeNull();
  expect(screen.getAllByRole("checkbox").every((box) => !(box as HTMLInputElement).checked)).toBe(
    true,
  );
  const search = screen.getByRole("searchbox", { name: "Find equipment" });
  fireEvent.change(search, { target: { value: "smith" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /^Smith machine/ }));
  fireEvent.change(search, { target: { value: "hack" } });
  // The search moved on: Smith machine is out of the results, still chosen, and nothing else is.
  expect(screen.queryByRole("checkbox", { name: /^Smith machine/ })).toBeNull();
  expect(sent().typeIds).toEqual(["smith_machine"]);
  expect(screen.getByRole("button", { name: "Review the 1 chosen" })).toBeTruthy();
});

it("shows both things a shared name means, side by side, rather than guessing", () => {
  show(previewMachinesStep("home", "experienced"));
  fireEvent.change(screen.getByRole("searchbox", { name: "Find equipment" }), {
    target: { value: "Roman chair" },
  });
  const either = within(screen.getByRole("region", { name: /can mean either/ }));
  expect(either.getByRole("checkbox", { name: /Back extension bench/ })).toBeTruthy();
  expect(either.getByRole("checkbox", { name: /Captain/ })).toBeTruthy();
});

it("starts a beginner at home from a starter set, with everything a tap away", () => {
  show(previewMachinesStep("home", "new"));
  expect(screen.queryByRole("button", { name: /usually here/ })).toBeNull();
  const starter = within(screen.getByRole("region", { name: "Common here" }));
  expect(starter.getByRole("checkbox", { name: /^Dumbbells/ })).toBeTruthy();
  expect(screen.queryByRole("searchbox")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Browse all equipment" }));
  expect(screen.getByRole("searchbox", { name: "Find equipment" })).toBeTruthy();
});

it("gives everyone outdoors the short calisthenics set", () => {
  show(previewMachinesStep("outdoor", "experienced"));
  const set = within(screen.getByRole("region", { name: "Common here" }));
  expect(set.getAllByRole("checkbox")).toHaveLength(4);
  expect(set.getByRole("checkbox", { name: /Pull-up bar/ })).toBeTruthy();
});

it("shows what the place already has, and offers an archived machine back to restore", () => {
  const { sent } = show(
    previewMachinesStep("gym", "experienced", {
      active: ["smith_machine"],
      archived: ["hack_squat"],
    }),
  );
  const smith = screen.getByRole("checkbox", { name: /^Smith machine/ }) as HTMLInputElement;
  expect(smith.checked).toBe(true);
  expect(smith.disabled).toBe(true);
  expect(smith.closest("label")!.textContent).toContain("Already registered here");
  const hack = screen.getByRole("checkbox", { name: /^Hack squat/ });
  expect(hack.closest("label")!.textContent).toContain("Archived here: tick to restore");
  fireEvent.click(hack);
  expect(sent().typeIds).toEqual(["hack_squat"]);
});

it("explains an item in words and pictures behind ⓘ, without ticking it", () => {
  const { sent } = show(previewMachinesStep("gym", "experienced"));
  fireEvent.click(screen.getByRole("button", { name: "About Hack squat" }));
  const sheet = within(screen.getByRole("dialog", { name: "Hack squat" }));
  expect(sheet.getByText("How to recognise it")).toBeTruthy();
  expect(sent().typeIds).toEqual([]);
  fireEvent.click(sheet.getByRole("button", { name: "Tick it" }));
  expect(sent().typeIds).toEqual(["hack_squat"]);
});
