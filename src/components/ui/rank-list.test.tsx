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

/** Each row's value, and the classes that set where it goes. */
function values() {
  return screen.getAllByRole("link").map((link) => link.lastElementChild as HTMLElement);
}

it("puts every row's value under its name at one width, wider on a board whose days name a year", () => {
  // A day with its year is the widest a value gets: the whole board folds for it, not the row.
  const dated = rank([
    { key: "a", username: "aarav", displayName: "Aarav", value: 26.7, occurredOn: "2025-12-12" },
    { key: "m", username: "meera", displayName: "Meera", value: 20, occurredOn: "2026-03-16" },
    { key: "s", username: "sofia", displayName: "Sofia", value: null, occurredOn: null },
  ]);
  render(<RankList rows={dated} you="m" format={String} currentYear="2026" />);
  for (const value of values()) {
    // Beside the name only from the row that holds the name's few words and a dated value; under
    // it, the whole row.
    expect(value.className).toContain("basis-full");
    expect(value.className).toContain("@min-[19.375rem]:basis-auto");
    expect(value.className).not.toContain("@min-[17.5rem]");
  }
  // The row answers for itself (a container query), so a row with nothing to rank folds too.
  expect(screen.getAllByRole("link").every((link) => link.className.includes("@container"))).toBe(
    true,
  );
  // Its figures in Jost, whose zero is plain.
  expect(values()[0]!.querySelector(".figures")?.textContent).toBe("26.7");
  cleanup();

  // This year's days alone stand beside the names on a narrower row.
  render(<RankList rows={rows} you="v" format={String} currentYear="2026" />);
  for (const value of values()) {
    expect(value.className).toContain("@min-[17.5rem]:basis-auto");
    expect(value.className).not.toContain("@min-[19.375rem]");
  }
  cleanup();

  // So does a board with no days at all (a period's totals).
  const totals = rank([
    { key: "v", username: "vinit", displayName: "Vinit", value: 15, occurredOn: null },
    { key: "p", username: "phani03", displayName: "Phani", value: 13, occurredOn: null },
  ]);
  render(<RankList rows={totals} you="v" format={String} />);
  expect(values().every((value) => value.className.includes("@min-[17.5rem]:basis-auto"))).toBe(
    true,
  );
});

it("folds a top weight's board for its work, as wide as a day with its year", () => {
  const worked = rank([
    {
      key: "v",
      username: "vinit",
      displayName: "Vinit",
      value: 88,
      occurredOn: "2026-09-08",
      detail: "4\u00a0sets ·\u00a0best\u00a05\u00a0reps",
    },
    { key: "p", username: "phani03", displayName: "Phani", value: 80, occurredOn: "2026-09-01" },
  ]);
  render(<RankList rows={worked} you="v" format={String} currentYear="2026" />);
  expect(values().every((value) => value.className.includes("@min-[19.375rem]:basis-auto"))).toBe(
    true,
  );
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
  expect(value!.className).toContain("@min-[19.375rem]:shrink-0");
  expect(value!.className).toContain("@min-[19.375rem]:max-w-[calc(var(--ov-type-caption)*8.75)]");
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
