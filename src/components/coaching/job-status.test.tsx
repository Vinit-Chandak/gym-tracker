// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import type { CoachJob } from "@/server/repositories/coaching-jobs";
import { CoachJobStatus } from "./job-status";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/server/actions/coaching-workflow", () => ({ answerCoachQuestionsAction: vi.fn() }));
vi.mock("@/components/ui/app-link", () => ({
  default: (props: ComponentProps<"a">) => <a {...props} />,
}));
afterEach(cleanup);

it("shows a successful review with no changes without inventing a draft or asking for a retry", () => {
  const job = {
    status: "succeeded",
    kind: "review_program",
    result: { outcome: "no_change", rationale: "The current plan still fits." },
  } as CoachJob;
  render(<CoachJobStatus job={job} draftId={null} base="/profile/programme" />);
  expect(screen.getByRole("status").textContent).toBe("Your programme stays as it is");
  expect(screen.getByText("The current plan still fits.")).toBeTruthy();
  expect(screen.queryByRole("link", { name: /try again|Review the draft/i })).toBeNull();
  // The page's own back link goes to Plan; nothing on the screen repeats it.
  expect(screen.queryByRole("link", { name: /Back to/ })).toBeNull();
});

it("says a failure in plain words, with what the coach wrote folded under Details", () => {
  const job = {
    id: "job",
    status: "failed",
    kind: "create_program",
    target: { scope: "programme", sport: "running" },
    error: "The local audit worker was unavailable.",
  } as CoachJob;
  render(<CoachJobStatus job={job} draftId={null} base="/profile/programme" />);
  expect(screen.getByRole("status").textContent).toBe("The coach could not finish");
  expect(screen.getByText("Your answers are saved.")).toBeTruthy();
  const details = screen.getByText("Details").closest("details")!;
  expect(details.open).toBe(false);
  expect(details.textContent).toContain("The local audit worker was unavailable.");
  expect(screen.getByRole("link", { name: "Try again" }).getAttribute("href")).toBe(
    "/plan/new?sport=running&method=coach",
  );
});

it("still offers the draft when one was produced", () => {
  render(
    <CoachJobStatus
      job={
        { status: "succeeded", kind: "review_program", target: { scope: "programme" } } as CoachJob
      }
      draftId="draft"
      base="/profile/programme"
    />,
  );
  expect(screen.getByRole("link", { name: "Review the draft" }).getAttribute("href")).toBe(
    "/profile/programme/drafts/draft",
  );
});
