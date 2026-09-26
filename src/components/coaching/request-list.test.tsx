// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";

import { RequestList, type RequestView } from "./request-list";
import { answerProgramRequestAction } from "@/server/actions/coaching-workflow";

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
  quote: "and more direct core work please",
  state: "waiting",
  detail: "",
  condition: "",
  reconsiderAfter: null,
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

it("uses a new answer key when the coach asks another question on the same request", async () => {
  vi.mocked(answerProgramRequestAction).mockResolvedValue({
    ok: true,
    value: { requestId: "request" },
  });
  const { rerender } = render(
    <RequestList requests={[request({ state: "needs_answer", detail: "Which day?" })]} />,
  );
  fireEvent.change(screen.getByRole("textbox", { name: "your answer to the coach" }), {
    target: { value: "Tuesday" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
  await waitFor(() => expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe(""));
  rerender(<RequestList requests={[request({ state: "waiting" })]} />);
  rerender(
    <RequestList requests={[request({ state: "needs_answer", detail: "At what time?" })]} />,
  );
  fireEvent.change(screen.getByRole("textbox"), { target: { value: "7 pm" } });
  fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
  await waitFor(() => expect(answerProgramRequestAction).toHaveBeenCalledTimes(2));
  const calls = vi.mocked(answerProgramRequestAction).mock.calls;
  expect(calls[0]![2]).not.toBe(calls[1]![2]);
});

it("titles each ask with the athlete's own words and says only what it needs now", () => {
  render(
    <RequestList
      requests={[
        request({ state: "needs_answer", detail: "Which day has the most time?" }),
        request({ id: "00000000-0000-4000-8000-000000000002", quote: "Bayesian curls" }),
      ]}
    />,
  );
  expect(screen.getByText("“and more direct core work please”")).toBeTruthy();
  expect(screen.getByText("Which day has the most time?")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Send answer" })).toBeTruthy();
  expect(screen.getByText("At the next coach run")).toBeTruthy();
  // No status badge restating the heading, and no date stamped by the coach's run.
  expect(screen.queryByText("Needs your answer")).toBeNull();
  expect(screen.queryByText(/Asked /)).toBeNull();
  expect(screen.getAllByRole("button", { name: "I no longer want this" })).toHaveLength(2);
});

it("says what a settled ask came to, with the change one tap away", () => {
  render(
    <RequestList
      requests={[
        request({
          state: "applied",
          outcome: "Doubles your direct core work.",
          settledOn: "19 Sept",
          draftId: "00000000-0000-4000-8000-000000000009",
        }),
        request({ id: "00000000-0000-4000-8000-000000000003", state: "withdrawn" }),
      ]}
    />,
  );
  expect(screen.getByText(/Done — Doubles your direct core work\./)).toBeTruthy();
  expect(screen.getByText(/You withdrew it/)).toBeTruthy();
  expect(screen.getByRole("link", { name: "See the change" }).getAttribute("href")).toBe(
    "/profile/programme/drafts/00000000-0000-4000-8000-000000000009",
  );
  expect(screen.queryByRole("button", { name: "I no longer want this" })).toBeNull();
});
