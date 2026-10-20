import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import { HistoryView } from "@/app/(app)/progress/history/history-view";
import { OverviewSection } from "@/app/(app)/progress/sections/overview-section";
import ProgressPreviewPage from "./page";

vi.mock("../../preview-shell", () => ({
  PreviewShell: ({ children }: { children: ReactNode }) => <main>{children}</main>,
}));
vi.mock("@/app/(app)/progress/history/history-view", () => ({
  HistoryView: vi.fn(() => null),
}));
vi.mock("@/app/(app)/progress/sections/overview-section", () => ({
  OverviewSection: vi.fn(() => null),
}));
vi.mock("@/components/ui/section-select", () => ({
  SectionSelect: ({ options }: { options: { value: string; label: string; href: string }[] }) => (
    <nav>
      {options.map((option) => (
        <a key={option.value} href={option.href}>
          {option.label}
        </a>
      ))}
    </nav>
  ),
}));

beforeEach(() => vi.clearAllMocks());
const render = async (params: Record<string, string>) =>
  renderToStaticMarkup(
    await ProgressPreviewPage({
      searchParams: Promise.resolve(params),
    } as PageProps<"/preview/progress">),
  );
const overviewProps = () =>
  vi.mocked(OverviewSection).mock.calls.at(-1)?.[0] as ComponentProps<typeof OverviewSection>;
const historyProps = () =>
  vi.mocked(HistoryView).mock.calls.at(-1)?.[0] as ComponentProps<typeof HistoryView>;

it.each(["early", "late", "first", "new"])(
  "renders every %s overview and history without invalid dates",
  async (state) => {
    const markup = await render({ state });
    const overview = overviewProps();
    expect(overview.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const item of overview.overview.latest) {
      expect(item.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(item.href).toBeUndefined();
    }
    expect(overview.historyHref).toBe(`/preview/progress?state=${state}&view=history`);
    expect(overview.calendarHref).toBeNull();
    expect(overview.dayHrefs).toEqual({});
    expect(markup).toContain(`state=${state}&amp;view=history`);
    await render({ state, view: "history" });
    const history = historyProps();
    for (const item of history.items) expect(item.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(history.backHref).toBe(`/preview/progress?state=${state}&view=overview`);
    if (state === "new") expect(history.items).toEqual([]);
    else expect(history.items.length).toBeGreaterThan(0);
  },
);

it.each(["constructor", "__proto__", "unknown"])(
  "falls back safely for the invalid state %s",
  async (state) => {
    await render({ state });
    expect(overviewProps().today).toBe("2026-10-08");
  },
);

it("applies the dates selected in preview History to the fixture records", async () => {
  await render({ state: "late", view: "history", from: "2026-10-01", to: "2026-10-07" });
  const history = historyProps();
  expect(history.items).toHaveLength(6);
  expect(history.range).toEqual({ from: "2026-10-01", to: "2026-10-07" });
  expect(history.items.every((item) => item.day >= "2026-10-01" && item.day <= "2026-10-07")).toBe(
    true,
  );
});
