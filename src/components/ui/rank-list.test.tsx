// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { rank } from "@/domain/leaderboard";
import { formatMinutes } from "@/lib/format";

import { RankList } from "./rank-list";

// Rows in long lists prefetch on touch, through the router (app-link.tsx).
vi.mock("next/navigation", () => ({ useRouter: () => ({ prefetch: vi.fn() }) }));

afterEach(cleanup);

const rows = rank([
  { key: "v", username: "vinit", displayName: "Vinit", value: 88, occurredOn: "2026-09-08" },
  { key: "p", username: "phani03", displayName: "Phani", value: 92.5, occurredOn: "2026-09-01" },
  { key: "s", username: "sam", displayName: null, value: null, occurredOn: null },
]);

it("lists rank, name and value, calls your own row You and highlights it", () => {
  render(<RankList rows={rows} you="v" format={(value) => `${value} kg`} />);
  const links = screen.getAllByRole("link");
  expect(links.map((link) => link.getAttribute("href"))).toEqual([
    "/u/phani03",
    "/u/vinit",
    "/u/sam",
  ]);
  expect(links[0]!.textContent).toContain("1");
  expect(links[0]!.textContent).toContain("Phani");
  expect(links[0]!.textContent).toContain("92.5 kg");
  expect(links[0]!.textContent).toContain("1\u00a0Sept\u00a02026");
  expect(links[1]!.textContent).toContain("You");
  expect(links[1]!.textContent).not.toContain("Vinit");
  expect(links[1]!.className).toContain("bg-accent-soft");
  expect(links[1]!.getAttribute("aria-current")).toBe("true");
});

/** Each row's value, and the classes that set where it goes. */
function values() {
  return screen.getAllByRole("link").map((link) => link.lastElementChild as HTMLElement);
}

/** A phone's sizes at 100% text, in px. */
const PHONE: Record<string, number> = {
  "--spacing": 4,
  "--ov-type-body": 16,
  "--ov-type-meta-small": 14,
  "--ov-type-caption": 13,
};

/**
 * The row a board's values need to stand beside the names, in px at 100% text: the length a
 * ranked value's fold compares the row with, worked out with a phone's sizes.
 */
function besideFrom(value: HTMLElement): number {
  const fold = value.style.getPropertyValue("--rank-fold");
  const room = /^min\(100%, max\(0px, \((.+) - 100%\) \* 9999\)\)$/.exec(fold)?.[1];
  if (!room) throw new Error(`Not a fold: "${fold}"`);
  const sum = room
    .replace(/var\((--[\w-]+)\)/g, (_, token: string) => String(PHONE[token]))
    .replace(/([\d.]+)rem/g, (_, rem: string) => String(Number(rem) * 16));
  const clamp = (least: number, value: number, most: number) =>
    Math.max(least, Math.min(value, most));
  return new Function("min", "max", "clamp", `return ${sum};`)(Math.min, Math.max, clamp);
}

/** The board's one fold: every ranked row compares the row with the same length. */
function boardBesideFrom(): number {
  const ranked = values().filter((value) => value.style.getPropertyValue("--rank-fold"));
  const widths = new Set(ranked.map(besideFrom));
  expect(widths.size).toBe(1);
  return [...widths][0]!;
}

// The row a phone gives a board at 100% text: its width less the gutters, the box's border and
// the row's padding.
const ROW = { 320: 254, 360: 286, 375: 301, 390: 316 } as const;

it("folds a year's long totals under the names at 360 pt and keeps them beside from 375", () => {
  // Beside "211 h 50 min" a 360-dp row left "Kenji Watanabe" 104 px: "Kenji" / "Watanabe".
  for (const [values, format] of [
    [[12710, 10359, 6497], formatMinutes],
    [[3113528, 1760374, 658690], (value: number) => `${value.toLocaleString("en-GB")}\u00a0lb`],
  ] as const) {
    const board = rank([
      {
        key: "k",
        username: "kenji",
        displayName: "Kenji Watanabe",
        value: values[0],
        occurredOn: null,
      },
      {
        key: "j",
        username: "jordan",
        displayName: "Jordan Reyes",
        value: values[1],
        occurredOn: null,
      },
      {
        key: "l",
        username: "liam",
        displayName: "Liam O'Connor",
        value: values[2],
        occurredOn: null,
      },
    ]);
    render(<RankList rows={board} you="j" format={format} />);
    expect(boardBesideFrom()).toBeGreaterThan(ROW[360]);
    expect(boardBesideFrom()).toBeLessThanOrEqual(ROW[375]);
    cleanup();
  }
});

it("keeps short values beside the names on a 360-pt phone, and a year's counts on a 320", () => {
  // "Jordan Reyes" wrapped beside "27.2 kg / Fri 9 Jan" with a third of the row empty.
  const best = rank([
    {
      key: "j",
      username: "jordan",
      displayName: "Jordan Reyes",
      value: 27.2,
      occurredOn: "2026-01-09",
    },
    {
      key: "a",
      username: "aarav",
      displayName: "Aarav Sharma",
      value: 20,
      occurredOn: "2026-07-03",
    },
  ]);
  render(
    <RankList rows={best} you="a" format={(value) => `${value}\u00a0kg`} currentYear="2026" />,
  );
  expect(boardBesideFrom()).toBeLessThanOrEqual(ROW[360]);
  cleanup();

  const counts = rank([
    { key: "s", username: "sofia", displayName: "Sofia Rossi", value: 236, occurredOn: null },
    { key: "j", username: "jordan", displayName: "Jordan Reyes", value: 159, occurredOn: null },
  ]);
  render(<RankList rows={counts} you="s" format={String} />);
  expect(boardBesideFrom()).toBeLessThanOrEqual(ROW[320]);
});

it("folds a board whose days name a year where a name would wrap beside one", () => {
  const dated = rank([
    {
      key: "j",
      username: "jordan",
      displayName: "Jordan Reyes",
      value: 225,
      occurredOn: "2025-12-09",
    },
    { key: "l", username: "liam", displayName: "Liam", value: 210, occurredOn: "2026-02-04" },
  ]);
  render(
    <RankList rows={dated} you="l" format={(value) => `${value}\u00a0lb`} currentYear="2026" />,
  );
  expect(boardBesideFrom()).toBeGreaterThan(ROW[360]);
  expect(boardBesideFrom()).toBeLessThanOrEqual(ROW[390]);
  // Its figures in Jost, whose zero is plain.
  expect(values()[0]!.querySelector(".figures")?.textContent).toBe("225");
});

it("gives a long name a first name and a surname's room, and wraps the rest beside the value", () => {
  // A name of any length would otherwise fold the board on every phone.
  const long = rank([
    {
      key: "a",
      username: "alexandra",
      displayName: "Alexandra Richardson-Whitfield",
      value: 15,
      occurredOn: null,
    },
    { key: "v", username: "vinit", displayName: "Vinit", value: 13, occurredOn: null },
  ]);
  render(<RankList rows={long} you="v" format={String} />);
  // The rank and the avatar (96 px with their gaps and the value's), 8rem of name and "15".
  expect(boardBesideFrom()).toBeLessThan(96 + 128 + 20);
});

it("sizes a value to its own lines, never to a column narrower than a day with its year", () => {
  // A fixed column split "Wed 10 Dec 2025" inside its year: beside the name the value is as wide
  // as it needs, up to a whole day with its year in the day's own size, and the day is one word.
  const dated = rank([
    { key: "l", username: "liam", displayName: "Liam", value: 53.3, occurredOn: "2025-12-10" },
  ]);
  render(<RankList rows={dated} you="l" format={String} currentYear="2026" />);
  const [value] = values();
  expect(value!.className).not.toMatch(/flex-\[0_0_/);
  expect(value!.className).toContain("basis-auto");
  expect(value!.className).toContain("shrink-0");
  expect(value!.className).toContain("max-w-[min(100%,calc(var(--ov-type-caption)*8.75))]");
  // Folded, its least width is the whole row, which outweighs the cap.
  expect(value!.className).toContain("min-w-(--rank-fold)");
  expect(value!.textContent).toContain("Wed\u00a010\u00a0Dec\u00a02025");
});

it("trails a person with nothing to rank, greyed, with a dash", () => {
  render(<RankList rows={rows} you="v" format={String} />);
  const last = screen.getAllByRole("link").at(-1)!;
  expect(last.textContent).toContain("sam");
  expect(last.className).toContain("text-ink-muted");
  expect(screen.getByLabelText("No data").textContent).toBe("—");
  // The rank column reads a dash too, not a number after the ranked rows.
  expect(within(last).getAllByText("—")).toHaveLength(2);
  // A dash takes none of a name's room, so it stays beside the name where the values fold.
  const dash = last.lastElementChild as HTMLElement;
  expect(dash.style.getPropertyValue("--rank-fold")).toBe("");
  expect(dash.className).not.toContain("min-w-(--rank-fold)");
  expect(values()[0]!.style.getPropertyValue("--rank-fold")).not.toBe("");
});

it("dates a best as the exercise page does, its year only outside this one", () => {
  // "24 Mar 2026" on a board read in 2026, beside the exercise page's "Thu 8 Oct".
  const dated = rank([
    { key: "v", username: "vinit", displayName: "Vinit", value: 88, occurredOn: "2026-03-24" },
    { key: "p", username: "phani03", displayName: "Phani", value: 92.5, occurredOn: "2025-10-13" },
  ]);
  render(<RankList rows={dated} you="v" format={String} currentYear="2026" />);
  const [first, second] = screen.getAllByRole("link");
  expect(first!.textContent).toMatch(/Mon\s13\sOct\s2025$/);
  expect(second!.textContent).toMatch(/Tue\s24\sMar$/);
});
