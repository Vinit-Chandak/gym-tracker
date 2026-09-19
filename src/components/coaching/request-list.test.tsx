// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { RequestList, type RequestView } from "./request-list";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  unstable_rethrow: () => {},
}));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
vi.mock("@/server/actions/coaching-workflow", () => ({
  answerProgramRequestAction: vi.fn(),
  withdrawProgramRequestAction: vi.fn(),
}));
afterEach(cleanup);

const request = (overrides: Partial<RequestView>): RequestView => ({
  id: "00000000-0000-4000-8000-000000000001",
  summary: "More direct core work",
  quote: "and more direct core work please",
  state: "waiting",
  detail: "",
  condition: "",
  reconsiderAfter: null,
  when: "Wed 16 Sept, 17:14",
  draftId: null,
  ...overrides,
});

it("dates a deferral the way the rest of the app dates anything", () => {
  render(
    <RequestList
      requests={[
        request({
          state: "deferred",
          detail: "Two more pain-free sessions first.",
          condition: "If the knee is still sore",
          reconsiderAfter: "2026-10-03",
        }),
      ]}
    />,
  );
  expect(screen.getByText(/Back on 3 Oct 2026/)).toBeTruthy();
  expect(screen.queryByText(/2026-10-03/)).toBeNull();
});

it("gives a question a box to answer it in, and a proposal the change instead", () => {
  render(
    <RequestList
      requests={[
        request({ state: "needs_answer", detail: "Which day has the most time?" }),
        request({
          id: "00000000-0000-4000-8000-000000000002",
          summary: "Add Bayesian cable curls",
          state: "proposed",
          draftId: "00000000-0000-4000-8000-000000000009",
        }),
      ]}
    />,
  );
  expect(screen.getByRole("button", { name: "Send answer" })).toBeTruthy();
  expect(screen.getByText("Needs your answer")).toBeTruthy();
  expect(screen.getByRole("link", { name: "See the change" }).getAttribute("href")).toBe(
    "/profile/programme/drafts/00000000-0000-4000-8000-000000000009",
  );
  // One question, one answer: a proposal is decided on its own change screen, so it offers no
  // second way to say no here.
  expect(screen.getAllByRole("button", { name: "I no longer want this" })).toHaveLength(1);
});
