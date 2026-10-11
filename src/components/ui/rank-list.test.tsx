// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { rank } from "@/domain/leaderboard";

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

it("gives every row's value the same width, so each row folds as the others do", () => {
  // A date with its year is wider than one without: the width is the column's, not the date's.
  const dated = rank([
    { key: "a", username: "aarav", displayName: "Aarav", value: 26.7, occurredOn: "2025-12-12" },
    { key: "m", username: "meera", displayName: "Meera", value: 20, occurredOn: "2026-03-16" },
  ]);
  render(<RankList rows={dated} you="m" format={String} currentYear="2026" />);
  const values = screen.getAllByRole("link").map((link) => link.lastElementChild!.className);
  expect(values.every((value) => value.includes("flex-[0_0_6.25rem]"))).toBe(true);
  // Its figures in Jost, whose zero is plain.
  expect(screen.getAllByRole("link")[0]!.querySelector(".figures")?.textContent).toBe("26.7");
});

it("trails a person with nothing to rank, greyed, with a dash", () => {
  render(<RankList rows={rows} you="v" format={String} />);
  const last = screen.getAllByRole("link").at(-1)!;
  expect(last.textContent).toContain("sam");
  expect(last.className).toContain("text-ink-muted");
  expect(screen.getByLabelText("No data").textContent).toBe("—");
  // The rank column reads a dash too, not a number after the ranked rows.
  expect(within(last).getAllByText("—")).toHaveLength(2);
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
