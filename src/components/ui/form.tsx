"use client";

import { useFormStatus } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { cn } from "@/lib/utils";

import { Button, type ButtonProps } from "./button";
import { Glyph } from "./glyphs";

type Refused = { element: HTMLElement; name: string };

/** A control's name as its label reads, without the help or the aside beside it. */
function nameOf(element: HTMLElement): string | null {
  const labelledBy = element.getAttribute("aria-labelledby");
  const fromIds = labelledBy
    ?.split(/\s+/)
    .map((id) => element.ownerDocument.getElementById(id)?.textContent?.trim())
    .filter(Boolean)
    .join(" ");
  const name =
    fromIds ||
    (element as HTMLInputElement).labels?.[0]?.textContent?.trim() ||
    element.getAttribute("aria-label")?.trim();
  return name || null;
}

/** "Distance" reads "distance" inside a sentence; "HR zones" keeps its capitals. */
const inSentence = (name: string) =>
  /^[A-Z][a-z]/.test(name) ? name[0]!.toLowerCase() + name.slice(1) : name;

/** What the form marks as not saveable, in page order, each named once. */
function refusedIn(form: HTMLFormElement): Refused[] {
  const seen = new Set<string>();
  const refused: Refused[] = [];
  for (const element of form.querySelectorAll<HTMLElement>('[aria-invalid="true"]')) {
    const name = nameOf(element);
    if (!name || seen.has(name)) continue;
    seen.add(name);
    refused.push({ element, name });
  }
  return refused;
}

/** The control a refused element stands for: itself, or the first control inside it. */
const controlOf = (element: HTMLElement) =>
  element.matches("input, select, textarea, button")
    ? element
    : (element.querySelector<HTMLElement>("input, select, textarea, button") ?? element);

/**
 * The refused save (DESIGN.md, Inputs and choices; 21 October 2026), over Save in the pinned
 * actions. The fields say what is wrong where they are; this bar only counts them and names them
 * ("2 to fix: lap 4, distance"), and leads to the first. A failure that is not a field's (the
 * connection, the server) is said here in the app's words. A sentence a field already says is
 * never said again here.
 */
export function FormError({ message }: { message?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [refused, setRefused] = useState<Refused[]>([]);
  const [repeated, setRepeated] = useState(false);

  useLayoutEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const read = () => {
      const now = refusedIn(form);
      // Its own bar is inside the form it watches: an unchanged list keeps its identity, so
      // drawing the bar never asks for another read.
      setRefused((was) =>
        was.length === now.length &&
        was.every(
          (item, index) => item.name === now[index]!.name && item.element === now[index]!.element,
        )
          ? was
          : now,
      );
      const said = [...form.querySelectorAll<HTMLElement>('[role="alert"]')].filter(
        (alert) => !ref.current?.contains(alert),
      );
      setRepeated(Boolean(message) && said.some((alert) => alert.textContent?.trim() === message));
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(form, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["aria-invalid"],
    });
    return () => observer.disconnect();
  }, [message]);

  const first = refused[0];
  const showMessage = Boolean(message) && !repeated;
  return (
    <div ref={ref} className="space-y-2 empty:hidden" data-refused-save>
      {first && (
        <div role="alert">
          <button
            type="button"
            onClick={() => {
              const control = controlOf(first.element);
              control.focus();
              control.scrollIntoView?.({ block: "center" });
            }}
            className="flex min-h-[var(--ov-target)] w-full items-center gap-2.5 rounded-control bg-danger-tint px-[calc(14*var(--ov-u))] py-2 text-left text-[length:var(--ov-type-meta-small)] leading-snug font-bold text-danger-text"
          >
            <Glyph name="chevronUp" className="glyph-20 shrink-0 text-danger-glyph" />
            <span className="min-w-0 [overflow-wrap:break-word]">
              {refused.length} to fix: {refused.map((item) => inSentence(item.name)).join(", ")}
            </span>
          </button>
        </div>
      )}
      {showMessage && (
        <p
          role="alert"
          tabIndex={-1}
          className="flex items-start gap-2.5 rounded-control bg-danger-tint px-[calc(14*var(--ov-u))] py-2.5 text-[length:var(--ov-type-meta-small)] leading-snug font-bold text-danger-text"
        >
          <Glyph name="warn" className="glyph-20 shrink-0 text-danger-glyph" />
          <span className="min-w-0 [overflow-wrap:break-word]">{message}</span>
        </p>
      )}
    </div>
  );
}

/**
 * Submit button that disables itself while the surrounding form's action is running.
 * Full width by default, for the stacked forms that are the common case; pass
 * `className="w-auto"` when it shares a row with another control, so it doesn't
 * claim the whole line and squeeze its sibling.
 */
export function SubmitButton({
  children,
  pendingLabel = "Saving…",
  disabled,
  className,
  ...props
}: ButtonProps & { pendingLabel?: string }) {
  const { pending } = useFormStatus();
  const ref = useRef<HTMLButtonElement>(null);
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !pending) {
      const form = ref.current?.form;
      const invalid = form?.querySelector<HTMLElement>('[aria-invalid="true"]');
      const target =
        invalid?.querySelector<HTMLElement>("input, select, textarea") ??
        invalid ??
        form?.querySelector<HTMLElement>('[role="alert"]');
      target?.focus();
      target?.scrollIntoView?.({ block: "center" });
    }
    wasPending.current = pending;
  }, [pending]);
  return (
    <Button
      ref={ref}
      type="submit"
      size="lg"
      {...props}
      className={cn("w-full", className)}
      disabled={pending || disabled}
      aria-busy={pending}
    >
      {pending ? pendingLabel : children}
    </Button>
  );
}

/**
 * Keeps what a form shows when its action settles. React resets a form after its action, while
 * it commits, with its own event handling switched off, so an `onReset` handler never hears it:
 * controlled choices (a select, a checkbox, a radio) are put back to their defaults on the
 * screen and in what the next submit sends, while the component's state still holds what was
 * chosen. A listener on the element itself does hear the reset, and cancelling it keeps every
 * field as it stands, which is what a form that failed to save wants: the athlete's choices, to
 * correct or retry. Attach the returned ref to the `<form>`.
 *
 * The listener follows the form itself, not the component: React sets the ref when the form
 * mounts, which for a form inside a sheet is long after the component that holds it (Skip, Move,
 * Pick up from today), so an effect run once at mount would find no form and never keep it.
 */
export function useKeptForm(): RefObject<HTMLFormElement | null> {
  const [ref] = useState(() => {
    let form: HTMLFormElement | null = null;
    const keep = (event: Event) => event.preventDefault();
    return {
      get current() {
        return form;
      },
      set current(next: HTMLFormElement | null) {
        if (next === form) return;
        form?.removeEventListener("reset", keep);
        form = next;
        form?.addEventListener("reset", keep);
      },
    } as RefObject<HTMLFormElement | null>;
  });
  return ref;
}
