// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { redirect } from "next/navigation";
import { Component, type ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { LeftOutOnError } from "./left-out-on-error";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function Failing(): ReactNode {
  throw new Error("Connection terminated unexpectedly");
}

function SignedOut(): ReactNode {
  redirect("/login");
}

/** Stands in for the boundaries above the shell, which handle what it lets through. */
class Above extends Component<{ children: ReactNode }, { caught: string | null }> {
  override state = { caught: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { caught: (error as { digest?: string }).digest ?? error.message };
  }
  override render() {
    return this.state.caught ? <p>Caught {this.state.caught}</p> : this.props.children;
  }
}

it("leaves out a failed part of the shell and keeps the page beside it", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <Above>
      <main>The page</main>
      <LeftOutOnError>
        <Failing />
      </LeftOutOnError>
    </Above>,
  );
  expect(screen.getByText("The page")).toBeTruthy();
  expect(screen.queryByText(/Caught/)).toBeNull();
});

it("lets a redirect through, so an ended session still leads to signing in", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <Above>
      <LeftOutOnError>
        <SignedOut />
      </LeftOutOnError>
    </Above>,
  );
  expect(screen.getByText(/Caught NEXT_REDIRECT/)).toBeTruthy();
});
