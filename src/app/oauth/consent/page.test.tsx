// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { Children, isValidElement, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  approve: vi.fn(),
  deny: vi.fn(),
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("not-found");
  }),
}));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect, notFound: mocks.notFound }));
vi.mock("@/server/coach-connector-consent", () => ({
  readCoachConnectorConsent: mocks.read,
  coachOAuthRedirect: (url: string) => url,
}));

import Page from "./page";
import { ConsentActions, type ConsentState } from "./consent-actions";

const callback = "https://chatgpt.com/connector_platform_oauth_redirect?code=test";
const details = {
  authorization_id: "test-consent",
  client: { id: "client", name: "ChatGPT backup" },
  user: { id: "owner" },
};
type DecisionAction = (state: ConsentState, form: FormData) => Promise<ConsentState>;
function actions(node: ReactNode): DecisionAction[] {
  return Children.toArray(node).flatMap((child) => {
    if (!isValidElement<{ action?: DecisionAction; children?: ReactNode }>(child)) return [];
    return child.type === ConsentActions && child.props.action
      ? [child.props.action]
      : actions(child.props.children);
  });
}
function decisionForm(decision: string) {
  const form = new FormData();
  form.set("decision", decision);
  return form;
}
beforeEach(() => {
  mocks.read.mockReset();
  mocks.approve.mockReset();
  mocks.deny.mockReset();
  mocks.redirect.mockClear();
  mocks.notFound.mockClear();
  mocks.read.mockResolvedValue({
    id: "test-consent",
    data: details,
    supabase: {
      auth: {
        oauth: {
          approveAuthorization: mocks.approve,
          denyAuthorization: mocks.deny,
        },
      },
    },
  });
  mocks.approve.mockResolvedValue({ data: { redirect_url: callback }, error: null });
  mocks.deny.mockResolvedValue({ data: { redirect_url: callback }, error: null });
});
afterEach(cleanup);

it("renders the real consent screen, requested access and both decisions", async () => {
  render(await Page({ searchParams: Promise.resolve({ authorization_id: "test-consent" }) }));
  expect(screen.getByRole("heading", { name: "Connect the coach backup" })).toBeTruthy();
  expect(screen.getByText("ChatGPT backup")).toBeTruthy();
  expect(screen.getByText(/read coaching evidence and retained reports/)).toBeTruthy();
  expect(screen.getByRole("button", { name: "Connect ChatGPT backup" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Decline" })).toBeTruthy();
});

it.each([
  ["approve", "approve"],
  ["deny", "decline"],
] as const)(
  "rechecks authorization when submitting %s and returns to the connector",
  async (decision, submittedDecision) => {
    const page = await Page({
      searchParams: Promise.resolve({ authorization_id: "test-consent" }),
    });
    await expect(actions(page)[0]!({}, decisionForm(submittedDecision))).rejects.toThrow(
      `redirect:${callback}`,
    );
    expect(mocks.read).toHaveBeenCalledTimes(2);
    expect(mocks[decision]).toHaveBeenCalledWith("test-consent", { skipBrowserRedirect: true });
    expect(mocks[decision === "approve" ? "deny" : "approve"]).not.toHaveBeenCalled();
  },
);

it("does not show consent without an authorization id or when access was rejected", async () => {
  await expect(Page({ searchParams: Promise.resolve({}) })).rejects.toThrow("not-found");
  expect(mocks.read).not.toHaveBeenCalled();
  mocks.read.mockRejectedValue(new Error("not-found"));
  await expect(
    Page({ searchParams: Promise.resolve({ authorization_id: "someone-elses-request" }) }),
  ).rejects.toThrow("not-found");
});

it("does not approve a connection after authorization is withdrawn", async () => {
  const page = await Page({ searchParams: Promise.resolve({ authorization_id: "test-consent" }) });
  mocks.read.mockRejectedValueOnce(new Error("not-found"));
  await expect(actions(page)[0]!({}, decisionForm("approve"))).rejects.toThrow("not-found");
  expect(mocks.approve).not.toHaveBeenCalled();
});

it("follows an already-decided authorization and returns a failed decision for inline retry", async () => {
  mocks.read.mockResolvedValueOnce({ data: { redirect_url: callback } });
  await expect(
    Page({ searchParams: Promise.resolve({ authorization_id: "test-consent" }) }),
  ).rejects.toThrow(`redirect:${callback}`);
  const page = await Page({ searchParams: Promise.resolve({ authorization_id: "test-consent" }) });
  mocks.approve.mockResolvedValueOnce({ data: null, error: new Error("Expired") });
  await expect(actions(page)[0]!({}, decisionForm("approve"))).resolves.toEqual({
    error: "The connection could not be saved. Please retry.",
  });
});
