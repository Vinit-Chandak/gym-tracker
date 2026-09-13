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
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechEvent = {
  resultIndex: number;
  results: { length: number; [index: number]: { isFinal: boolean; 0: { transcript: string } } };
};
type RecogniserClass = new () => Recogniser;

function recogniserClass(): RecogniserClass | null {
  if (typeof window === "undefined") return null;
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
  // The newest callback, so a recogniser started one render ago still writes to the live field.
  // Updated after each render rather than during one: the ref is read from an event, never
  // from render, so it is always current by the time a phrase arrives.
  const receive = useRef(onPhrase);
  useEffect(() => {
    receive.current = onPhrase;
  });

  useEffect(
    () => () => {
      recogniser.current?.abort();
      recogniser.current = null;
    },
    [],
  );

  const toggle = useCallback(() => {
    if (recogniser.current) {
      recogniser.current.stop();
      return;
    }
    const Recognition = recogniserClass();
    if (!Recognition) return;
    const session = new Recognition();
    session.lang = document.documentElement.lang || navigator.language || "en-GB";
    session.continuous = true;
    session.interimResults = false;
    session.onresult = (event) => {
      let said = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result?.isFinal) said += result[0].transcript;
      }
      if (said.trim()) receive.current(said.trim());
    };
    session.onerror = (event) => {
      setError(
        event.error === "not-allowed" || event.error === "service-not-allowed"
          ? "Microphone access is off for this site. Turn it on in your browser settings, or use your keyboard's dictation key."
          : event.error === "no-speech"
            ? "Nothing was heard. Try again."
            : "Dictation stopped. You can keep typing.",
      );
    };
    session.onend = () => {
      recogniser.current = null;
      setListening(false);
    };
    try {
      session.start();
    } catch {
      setError("Dictation could not start. You can keep typing.");
      return;
    }
    recogniser.current = session;
    setError(null);
    setListening(true);
  }, []);

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
  /** What this box is for, for the mic's accessible name: "your brief". */
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
    onChange(current ? `${current.replace(/\s+$/, "")} ${phrase}` : phrase);
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
