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
  expect(screen.queryByRole("link", { name: /try again|Review the draft/ })).toBeNull();
  expect(screen.getByRole("link", { name: "Back to Programme" })).toBeTruthy();
});

it("still offers the draft when one was produced", () => {
  render(
    <CoachJobStatus
      job={{ status: "succeeded", kind: "review_program" } as CoachJob}
      draftId="draft"
      base="/profile/programme"
    />,
  );
  expect(screen.getByRole("link", { name: "Review the draft" }).getAttribute("href")).toBe(
    "/profile/programme/drafts/draft",
  );
});
