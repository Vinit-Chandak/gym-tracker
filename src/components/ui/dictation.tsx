"use client";

import { Mic, MicOff } from "@/components/ui/icons";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";

/**
 * The browser's own speech recogniser, in the two names it goes by. Typed here rather than
 * globally because this file is the only thing in the app that touches it.
 */
type Recogniser = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: { isFinal: boolean; 0: { transcript: string } } };
};
type RecogniserClass = new () => Recogniser;

/**
 * iOS, where the constructor exists and the thing behind it does not work.
 *
 * Every browser on iOS is WebKit, and there `webkitSpeechRecognition` accepts `start()` and
 * then reports nothing at all — no result, no error, no end — most reliably inside an
 * installed web app, which is how this app is used. Feature detection cannot see that, so it
 * is named here. The keyboard's own dictation key types into these boxes on iOS regardless,
 * which is the same thing without a button.
 */
function isIos(): boolean {
  const agent = navigator.userAgent;
  return (
    /iPad|iPhone|iPod/.test(agent) ||
    // iPadOS reports itself as a Mac; the touch points are what give it away.
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function recogniserClass(): RecogniserClass | null {
  if (typeof window === "undefined" || isIos()) return null;
  const scope = window as unknown as {
    SpeechRecognition?: RecogniserClass;
    webkitSpeechRecognition?: RecogniserClass;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

/** Nothing subscribes: a browser does not grow speech recognition while a form is open. */
const noSubscription = () => () => {};

/**
 * Whether this browser can listen. Read through `useSyncExternalStore` so the server and the
 * first client render agree on "no" and hydration stays clean; the button appears a paint later
 * where it works, and never appears at all where it does not.
 */
export function useDictationSupported(): boolean {
  return useSyncExternalStore(
    noSubscription,
    () => recogniserClass() !== null,
    () => false,
  );
}

/** How long an engine may accept `start()` and then say nothing before we give up on it. */
const START_TIMEOUT_MS = 3000;

type DictationState = {
  supported: boolean;
  listening: boolean;
  error: string | null;
  toggle: () => void;
};

/**
 * Speech straight into a field.
 *
 * Every phone keyboard already has a dictation key, and it types into any box without our
 * help; this is the same thing with an affordance, for people who would never think to look
 * for it. Recognition happens in the browser, so there is nothing to upload, no key to hold
 * and no cost per minute — and where the browser has none, `supported` is false and the
 * button is simply not drawn.
 *
 * Only finished phrases are committed. Interim results arrive and are revised word by word,
 * so appending them would write the same sentence three times over.
 */
export function useDictation(onPhrase: (text: string) => void): DictationState {
  const supported = useDictationSupported();
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recogniser = useRef<Recogniser | null>(null);
  const watchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The newest callback, so a recogniser started one render ago still writes to the live field.
  // Updated after each render rather than during one: the ref is read from an event, never
  // from render, so it is always current by the time a phrase arrives.
  const receive = useRef(onPhrase);
  useEffect(() => {
    receive.current = onPhrase;
  });

  /**
   * Back to not listening, whatever the engine thinks.
   *
   * This is the whole safety of the control. An engine that never calls `onend` — WebKit's,
   * when recognition dies quietly — used to leave `recogniser.current` set forever, and every
   * later tap took the "already running, stop it" branch and returned. The button could not be
   * turned off again. So the reference is dropped and the handlers detached first, and only
   * then is the session told to stop; nothing here waits to be told it worked.
   */
  const finish = useCallback((message: string | null) => {
    if (watchdog.current) clearTimeout(watchdog.current);
    watchdog.current = null;
    const session = recogniser.current;
    recogniser.current = null;
    setListening(false);
    if (message !== null) setError(message);
    if (!session) return;
    session.onstart = null;
    session.onresult = null;
    session.onerror = null;
    session.onend = null;
    try {
      session.abort();
    } catch {
      // A session that is already gone has nothing to abort.
    }
  }, []);

  useEffect(() => () => finish(null), [finish]);

  const toggle = useCallback(() => {
    if (recogniser.current) {
      finish(null);
      return;
    }
    const Recognition = recogniserClass();
    if (!Recognition) return;
    const session = new Recognition();
    session.lang = document.documentElement.lang || navigator.language || "en-GB";
    session.continuous = true;
    session.interimResults = false;
    /**
     * How many results we have already written down.
     *
     * `resultIndex` is meant to say where the new ones start, and some engines leave it at
     * zero while `results` keeps growing — which replayed the whole conversation on every
     * phrase and wrote "one onetwo onetwothree" into the box. Counting for ourselves is the
     * only reading that holds on all of them. Interim results stop the scan rather than being
     * consumed, so a phrase still being revised is not lost when it settles.
     */
    let consumed = 0;
    session.onstart = () => {
      if (watchdog.current) clearTimeout(watchdog.current);
      watchdog.current = null;
    };
    session.onresult = (event) => {
      if (watchdog.current) clearTimeout(watchdog.current);
      watchdog.current = null;
      const said: string[] = [];
      let index = consumed;
      for (; index < event.results.length; index++) {
        const result = event.results[index];
        if (!result?.isFinal) break;
        const phrase = result[0].transcript.trim();
        if (phrase) said.push(phrase);
      }
      consumed = index;
      if (said.length) receive.current(said.join(" "));
    };
    session.onerror = (event) => {
      // "no-speech" and "aborted" are how a working engine says nothing was said and that we
      // stopped it ourselves. Neither is worth a line of red under the box.
      finish(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access is off for this site. Turn it on in your browser settings, or use your keyboard's dictation key."
          : event.error === "no-speech" || event.error === "aborted"
            ? null
            : "Dictation stopped. You can keep typing.",
      );
    };
    session.onend = () => finish(null);
    // Listening is declared before the engine is started, not after. An engine that refuses
    // permission calls `onerror` and `onend` from inside `start()`, and finishing a session
    // the hook did not yet consider its own left the button listening on a session that had
    // already given up. Setting it first means those handlers find the state they must undo.
    recogniser.current = session;
    setError(null);
    setListening(true);
    // An engine that takes the start and then says nothing at all leaves the button listening
    // forever. Give it a few seconds to prove it is alive, then take the control back.
    watchdog.current = setTimeout(
      () => finish("Dictation did not start. Use your keyboard's dictation key instead."),
      START_TIMEOUT_MS,
    );
    try {
      session.start();
    } catch {
      finish("Dictation could not start. You can keep typing.");
    }
  }, [finish]);

  return { supported, listening, error, toggle };
}

/**
 * The button itself: a mic in the corner of a field, and one line saying it is listening.
 * Drawn only where the browser can hear, so nothing on screen promises what it cannot do.
 */
export function DictationButton({
  label,
  listening,
  onToggle,
  className,
}: {
  /** What is being dictated, for the button's accessible name: "your brief". */
  label: string;
  listening: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={listening}
      aria-label={listening ? `Stop dictating ${label}` : `Dictate ${label}`}
      className={cn(
        "flex size-11 items-center justify-center rounded-full transition-colors duration-[var(--ov-duration-feedback)]",
        listening
          ? "bg-accent text-on-accent"
          : "bg-surface-raised text-ink-muted hover:text-ink active:bg-surface",
        className,
      )}
    >
      {listening ? <MicOff aria-hidden /> : <Mic aria-hidden />}
    </button>
  );
}

/**
 * A long answer you can write or speak.
 *
 * The mic sits inside the box, bottom right, where a send button sits in a messaging app;
 * the box keeps room for it so a long answer never runs underneath. Field clones its
 * control to attach the label and any error, so every identifying prop it hands down is
 * forwarded to the real textarea rather than kept on the wrapper.
 */
export function SpeechTextarea({
  value,
  onChange,
  label,
  id,
  rows = 5,
  maxLength,
  placeholder,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
  "aria-labelledby": labelledBy,
}: {
  value: string;
  onChange: (value: string) => void;
  /** Names the mic and, when no visible Field label is attached, the textarea. */
  label: string;
  id?: string;
  rows?: number;
  maxLength?: number;
  placeholder?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-labelledby"?: string;
}) {
  const box = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation((phrase) => {
    const current = box.current?.value ?? value;
    const next = current ? `${current.replace(/\s+$/, "")} ${phrase}` : phrase;
    // Typing is stopped at `maxLength` by the browser; speech is written in by script, which
    // the browser does not bound. Without this a long dictation walks past the limit the
    // answer is validated against and the save is refused for a reason nobody can see.
    onChange(maxLength === undefined ? next : next.slice(0, maxLength));
  });
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="relative">
        <textarea
          ref={box}
          id={id}
          aria-describedby={describedBy}
          aria-invalid={invalid}
          aria-labelledby={labelledBy}
          aria-label={id || labelledBy ? undefined : label}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={cn(
            "min-h-24 w-full min-w-0 resize-y rounded-control border border-line-strong bg-surface px-3 py-3 text-[length:var(--ov-text-input)] leading-snug text-ink placeholder:text-ink-ghost focus:border-accent focus:outline-none",
            dictation.supported && "pb-14",
          )}
        />
        {dictation.supported && (
          <DictationButton
            label={label}
            listening={dictation.listening}
            onToggle={dictation.toggle}
            className="absolute right-2 bottom-2"
          />
        )}
      </div>
      {dictation.listening && (
        <p role="status" className="flex items-center gap-2 text-xs text-accent">
          <span className="size-2 animate-pulse rounded-full bg-accent" aria-hidden />
          Listening — tap the microphone to stop
        </p>
      )}
      {dictation.error && (
        <p role="alert" className="text-xs text-ink-muted">
          {dictation.error}
        </p>
      )}
    </div>
  );
}
