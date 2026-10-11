// @vitest-environment jsdom
import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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

it("shows someone who already trains the basics as one line, then what is often missed", () => {
  const { sent } = show(previewMachinesStep("gym", "experienced"));
  const review = screen.getByRole("button", { name: /^Usually here \(18\)/ });
  expect(review.textContent).toContain(
    "Barbell, EZ curl bar, dumbbells, weight plates and 14 more",
  );
  const missed = within(screen.getByRole("list", { name: "Often missed" }));
  const rows = missed.getAllByRole("checkbox");
  expect(
    rows.map((row) => row.closest("label")!.querySelector(".picker-row-name")!.textContent),
  ).toEqual([
    "Belt squat machine",
    "Glute-ham developer",
    "Trap / hex bar",
    "Reverse hyper",
    "Safety squat bar",
  ]);
  expect(rows.every((row) => !(row as HTMLInputElement).checked)).toBe(true);
  expect(sent()).toEqual({ typeIds: [], combinationIds: [], notHere: [] });
  fireEvent.click(missed.getByRole("checkbox", { name: /Belt squat/ }));
  expect(sent().typeIds).toEqual(["belt_squat"]);
  expect(screen.getByRole("button", { name: "Add 1 and continue" })).toBeTruthy();
});

/** Audit B3: "pec deck" used to find only the rear delt machine, since the basics were left out. */
it("finds the basics too, counted already, with Not here beside them", () => {
  const { sent } = show(previewMachinesStep("gym", "experienced"));
  fireEvent.change(screen.getByRole("searchbox", { name: "Find equipment" }), {
    target: { value: "pec deck" },
  });
  const matches = within(screen.getByRole("list", { name: "Matches" }));
  const pecDeck = matches.getByText("Pec deck (fly / reverse fly)").closest("li")!;
  expect(pecDeck.textContent).toContain("Usually here, counted already");
  // Nothing to tick: it counts as there already. Saying it is not is the one thing to do.
  expect(within(pecDeck).queryByRole("checkbox")).toBeNull();
  fireEvent.click(within(pecDeck).getByRole("button", { name: /is not here/ }));
  expect(sent().notHere).toEqual(["pec_deck"]);
  expect(pecDeck.textContent).toContain("Marked not here");
  expect(matches.getByRole("checkbox", { name: /Rear delt machine/ })).toBeTruthy();
});

it("records a basic as not here from its Review, and counts what is left", () => {
  const { sent } = show(previewMachinesStep("gym", "experienced"));
  fireEvent.click(screen.getByRole("button", { name: /^Usually here \(18\)/ }));
  const sheet = within(screen.getByRole("dialog", { name: "Usually here" }));
  const pecDeck = sheet.getByRole("checkbox", { name: /Pec deck/ }) as HTMLInputElement;
  expect(pecDeck.checked).toBe(true);
  fireEvent.click(pecDeck);
  fireEvent.click(sheet.getByRole("button", { name: "Done" }));
  expect(sent().notHere).toEqual(["pec_deck"]);
  const line = screen.getByRole("button", { name: /^Usually here \(17\)/ });
  expect(line.textContent).toContain("Not here: pec deck");
});

it("asks which variant a family is, and registers nothing when the answer is Not sure", () => {
  const { sent } = show(previewMachinesStep("gym", "new"));
  const extras = within(screen.getByRole("list", { name: "What else is here?" }));
  const family = extras.getByRole("checkbox", { name: /^Chest press/ });
  fireEvent.click(family);
  let sheet = within(screen.getByRole("dialog", { name: "Which chest press?" }));
  fireEvent.click(sheet.getByRole("button", { name: "Not sure" }));
  expect(sent().typeIds).toEqual([]);
  fireEvent.click(extras.getByRole("checkbox", { name: /^Chest press/ }));
  sheet = within(screen.getByRole("dialog", { name: "Which chest press?" }));
  fireEvent.click(sheet.getByRole("button", { name: /Iso-lateral/ }));
  expect(sent().typeIds).toEqual(["iso_lateral_press"]);
});

it("searches every other type by any of its names, and keeps what was chosen", () => {
  const { sent } = show(previewMachinesStep("gym", "experienced"));
  const search = screen.getByRole("searchbox", { name: "Find equipment" });
  fireEvent.change(search, { target: { value: "smith" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /^Smith machine/ }));
  fireEvent.change(search, { target: { value: "hack" } });
  // The search moved on: Smith machine is out of the results, still chosen, and nothing else is.
  expect(screen.queryByRole("checkbox", { name: /^Smith machine/ })).toBeNull();
  expect(sent().typeIds).toEqual(["smith_machine"]);
  expect(screen.getByRole("button", { name: /^1 selected/ })).toBeTruthy();
  // Enter (a phone's Search key) ends the typing; it does not move the step on.
  const enter = createEvent.keyDown(search, { key: "Enter" });
  fireEvent(search, enter);
  expect(enter.defaultPrevented).toBe(true);
});

it("shows both things a shared name means, side by side, rather than guessing", () => {
  show(previewMachinesStep("home", "experienced"));
  fireEvent.click(screen.getByRole("button", { name: /Browse all equipment/ }));
  fireEvent.change(screen.getByRole("searchbox", { name: "Find equipment" }), {
    target: { value: "Roman chair" },
  });
  const either = within(screen.getByRole("region", { name: /can mean either/ }));
  expect(either.getByRole("checkbox", { name: /Back extension bench/ })).toBeTruthy();
  expect(either.getByRole("checkbox", { name: /Captain/ })).toBeTruthy();
});

it("asks anyone at home what they have, as pictures, with everything else a tap away", () => {
  for (const experience of ["new", "experienced"] as const) {
    show(previewMachinesStep("home", experience));
    expect(screen.queryByRole("button", { name: /usually here/i })).toBeNull();
    const kit = within(screen.getByRole("list", { name: "Equipment" }));
    expect(kit.getByRole("checkbox", { name: /^Dumbbells/ })).toBeTruthy();
    expect(screen.queryByRole("searchbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Browse all equipment/ }));
    expect(screen.getByRole("searchbox", { name: "Find equipment" })).toBeTruthy();
    cleanup();
  }
});

it("gives everyone outdoors the short calisthenics set", () => {
  show(previewMachinesStep("outdoor", "experienced"));
  const set = within(screen.getByRole("list", { name: "Equipment" }));
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
  fireEvent.click(screen.getByRole("button", { name: "Browse all equipment" }));
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
  fireEvent.click(screen.getByRole("button", { name: "About Belt squat machine" }));
  const sheet = within(screen.getByRole("dialog", { name: "Belt squat machine" }));
  expect(sent().typeIds).toEqual([]);
  fireEvent.click(sheet.getByRole("button", { name: "Tick it" }));
  expect(sent().typeIds).toEqual(["belt_squat"]);
});

/** Audit B9: a Skip beside Add dropped whatever was ticked, without a word. */
it("has no Skip: Continue with nothing chosen is the way past", () => {
  show(previewMachinesStep("gym", "experienced"));
  expect(screen.getByRole("button", { name: "Continue" })).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: /Belt squat/ }));
  expect(screen.queryByRole("link", { name: /skip/i })).toBeNull();
  expect(screen.getByRole("button", { name: "Add 1 and continue" })).toBeTruthy();
});

it("goes back to the basics' Review from a basic's About, which can say it is not here", () => {
  const { sent } = show(previewMachinesStep("gym", "experienced"));
  fireEvent.click(screen.getByRole("button", { name: /^Usually here \(18\)/ }));
  let review = within(screen.getByRole("dialog", { name: "Usually here" }));
  fireEvent.click(review.getByRole("button", { name: /^About Pec deck/ }));
  const about = within(screen.getByRole("dialog", { name: /^Pec deck/ }));
  fireEvent.click(about.getByRole("button", { name: "Not here" }));
  expect(sent().notHere).toEqual(["pec_deck"]);
  review = within(screen.getByRole("dialog", { name: "Usually here" }));
  expect((review.getByRole("checkbox", { name: /Pec deck/ }) as HTMLInputElement).checked).toBe(
    false,
  );
});

it("keeps the focus in the selection when one is removed, and on Continue when none is left", async () => {
  show(previewMachinesStep("gym", "experienced"));
  const search = screen.getByRole("searchbox", { name: "Find equipment" });
  fireEvent.change(search, { target: { value: "smith" } });
  // What a search found is said as well as shown.
  expect(screen.getAllByRole("status").some((s) => /match/.test(s.textContent ?? ""))).toBe(true);
  fireEvent.click(screen.getByRole("checkbox", { name: /^Smith machine/ }));
  fireEvent.change(search, { target: { value: "hack" } });
  fireEvent.click(screen.getByRole("checkbox", { name: /^Hack squat/ }));
  fireEvent.click(screen.getByRole("button", { name: /^2 selected/ }));
  const sheet = within(screen.getByRole("dialog", { name: "Selected" }));
  fireEvent.click(sheet.getByRole("button", { name: "Remove Smith machine" }));
  await waitFor(() =>
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Remove Hack squat"),
  );
  fireEvent.click(sheet.getByRole("button", { name: "Remove Hack squat" }));
  await waitFor(() => expect(document.activeElement?.textContent).toBe("Continue"));
});
