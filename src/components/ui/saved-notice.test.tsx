// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { SavedNotice } from "./saved-notice";

afterEach(cleanup);

it("stands for three seconds, and longer while a finger is on it, so Undo is never pulled away", () => {
  vi.useFakeTimers();
  try {
    render(<SavedNotice action={<button type="button">Undo</button>}>Run saved</SavedNotice>);
    const notice = screen.getByRole("status");
    expect(notice.textContent).toContain("Run saved");
    fireEvent.pointerEnter(notice);
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole("status")).not.toBeNull();
    fireEvent.pointerLeave(notice);
    act(() => vi.advanceTimersByTime(3000));
    expect(screen.queryByRole("status")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it("goes after three seconds when nothing holds it", () => {
  vi.useFakeTimers();
  try {
    render(<SavedNotice>Saved</SavedNotice>);
    act(() => vi.advanceTimersByTime(2999));
    expect(screen.queryByRole("status")).not.toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByRole("status")).toBeNull();
  } finally {
    vi.useRealTimers();
  }
});
