// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
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
  expect(links[0]!.textContent).toContain("1 Sept 2026");
  expect(links[1]!.textContent).toContain("You");
  expect(links[1]!.textContent).not.toContain("Vinit");
  expect(links[1]!.className).toContain("bg-accent-soft");
  expect(links[1]!.getAttribute("aria-current")).toBe("true");
});

it("trails a person with nothing to rank, greyed, with a dash", () => {
  render(<RankList rows={rows} you="v" format={String} />);
  const last = screen.getAllByRole("link").at(-1)!;
  expect(last.textContent).toContain("sam");
  expect(last.className).toContain("text-ink-muted");
  expect(screen.getByLabelText("No data").textContent).toBe("—");
  // The rank column reads a dash too, not a number after the ranked rows.
  expect(last.querySelector("span")!.textContent).toBe("—");
});
