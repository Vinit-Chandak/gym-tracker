// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act, useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { SpeechTextarea } from "./dictation";

/**
 * A recogniser that misbehaves the way real ones do.
 *
 * Every failure here was seen in a browser, not imagined: an engine that takes `start()` and
 * then reports nothing, one that never calls `onend`, and one that leaves `resultIndex` at
 * zero while `results` keeps growing. Each of them used to leave the button listening with no
 * way back, which is what "the app is stuck" looked like from the outside.
 */
class FakeRecogniser {
  static instances: FakeRecogniser[] = [];
  static mode: "normal" | "noend" | "silent" | "denied" = "normal";
  lang = "";
  continuous = false;
  interimResults = false;
  started = false;
  aborted = false;
  onstart: (() => void) | null = null;
  onresult: ((event: unknown) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  private finals: string[] = [];

  constructor() {
    FakeRecogniser.instances.push(this);
  }
  start() {
    this.started = true;
    if (FakeRecogniser.mode === "silent") return;
    this.onstart?.();
    if (FakeRecogniser.mode === "denied") {
      this.onerror?.({ error: "not-allowed" });
      this.onend?.();
    }
  }
  stop() {
    if (FakeRecogniser.mode !== "noend") this.onend?.();
  }
  abort() {
    this.aborted = true;
  }
  /** Replays every result so far with resultIndex pinned at 0, as some engines do. */
  say(phrase: string) {
    this.finals.push(phrase);
    const results = this.finals.map((text) => ({ isFinal: true, 0: { transcript: text } }));
    this.onresult?.({
      resultIndex: 0,
      results: Object.assign(results, { length: results.length }),
    });
  }
}

function Box({ maxLength }: { maxLength?: number }) {
  const [value, setValue] = useState("");
  return (
    <SpeechTextarea label="your brief" value={value} onChange={setValue} maxLength={maxLength} />
  );
}

const mic = () => screen.getByRole("button", { name: /dictat/i });
const listening = () => screen.queryByText(/Listening/) !== null;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
beforeEach(() => {
  FakeRecogniser.instances = [];
  FakeRecogniser.mode = "normal";
  Object.defineProperty(window, "SpeechRecognition", {
    value: FakeRecogniser,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(navigator, "userAgent", {
    value: "Mozilla/5.0 (Linux; Android 14) Chrome/120",
    configurable: true,
  });
});

it("writes each phrase once even when the engine replays every result", async () => {
  render(<Box />);
  fireEvent.click(mic());
  const session = FakeRecogniser.instances[0]!;
  for (const phrase of ["one", "two", "three"]) act(() => session.say(phrase));
  await waitFor(() =>
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("one two three"),
  );
});

it("stops on the second tap even when the engine never reports that it ended", async () => {
  FakeRecogniser.mode = "noend";
  render(<Box />);
  fireEvent.click(mic());
  expect(listening()).toBe(true);
  fireEvent.click(mic());
  await waitFor(() => expect(listening()).toBe(false));
  expect(FakeRecogniser.instances[0]!.aborted).toBe(true);
  // And the control is usable again rather than wedged on the dead session.
  fireEvent.click(mic());
  await waitFor(() => expect(FakeRecogniser.instances).toHaveLength(2));
});

it("gives up on an engine that starts and then says nothing", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  FakeRecogniser.mode = "silent";
  render(<Box />);
  fireEvent.click(mic());
  expect(listening()).toBe(true);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(3100);
  });
  expect(listening()).toBe(false);
  expect(screen.getByText(/did not start/)).toBeTruthy();
});

it("says how to fix a refused microphone, and does not stay listening", async () => {
  FakeRecogniser.mode = "denied";
  render(<Box />);
  fireEvent.click(mic());
  await waitFor(() => expect(listening()).toBe(false));
  expect(screen.getByText(/Microphone access is off/)).toBeTruthy();
});

it("never dictates past the length the answer is validated against", async () => {
  render(<Box maxLength={10} />);
  fireEvent.click(mic());
  const session = FakeRecogniser.instances[0]!;
  act(() => session.say("a considerably longer phrase than fits"));
  await waitFor(() =>
    expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("a consider"),
  );
});

it("draws no microphone on iOS, where the engine accepts start and then goes quiet", () => {
  Object.defineProperty(navigator, "userAgent", {
    value: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) Version/17.5 Mobile Safari",
    configurable: true,
  });
  render(<Box />);
  expect(screen.queryByRole("button", { name: /dictat/i })).toBeNull();
  expect(screen.getByRole("textbox")).toBeTruthy();
});
