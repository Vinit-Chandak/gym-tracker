"use client";

import { useFormStatus } from "react-dom";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";

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

/**
 * What the form marks as not saveable, in page order, each field once: a field drawn as several
 * controls (a distance's whole and the digits after its point) is one field, named by its own
 * label, as the field says it.
 */
function refusedIn(form: HTMLFormElement): Refused[] {
  const seen = new Set<Element | string>();
  const refused: Refused[] = [];
  for (const element of form.querySelectorAll<HTMLElement>('[aria-invalid="true"]')) {
    // A whole fold may be refused while its individual inputs carry aria-invalid directly.
    // Find the input's own field first, or every lap error is named after the fold's first label.
    const field = element.closest<HTMLElement>(
      '.ov-field, .row-stepper, .scale, [data-field-error="true"]',
    );
    // A split figure shares its row's label; other controls already expose their own name.
    // A group's first radio label is an answer ("kg", "5"), never the group's name.
    const label = field?.matches(".row-stepper")
      ? field.querySelector("label")?.textContent?.trim()
      : undefined;
    // A lap's field is named with its lap ("lap 4 time"), as the run has a time of its own.
    const lap = element.closest(".lap-row")?.querySelector(".lap-row-number")?.textContent?.trim();
    const own = label || nameOf(element) || field?.querySelector("label")?.textContent?.trim();
    const name = own && lap ? `${lap} ${own[0]!.toLowerCase()}${own.slice(1)}` : own;
    const key = field ?? name;
    if (!name || !key || seen.has(key)) continue;
    seen.add(key);
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
export function FormError({
  message,
  formId,
  action,
  trackFields = true,
}: {
  message?: string;
  /** A sheet can pin its actions outside the form they submit. */
  formId?: string;
  /** A retry or recovery action for a failure unrelated to an individual field. */
  action?: ReactNode;
  /** Independent actions inside another form must not repeat that form's field summary. */
  trackFields?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [refused, setRefused] = useState<Refused[]>([]);
  const [repeated, setRepeated] = useState(false);

  useLayoutEffect(() => {
    if (!trackFields) return;
    const form = formId
      ? ref.current?.ownerDocument.getElementById(formId)
      : ref.current?.closest("form");
    if (!(form instanceof HTMLFormElement)) return;
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
  }, [message, formId, trackFields]);

  const first = trackFields ? refused[0] : undefined;
  const showMessage = Boolean(message) && (!trackFields || !repeated);
  return (
    <div ref={ref} className="space-y-2 empty:hidden" data-refused-save>
      {first && (
        // Not an alert: each refused field says its own words as one, and Save brings the first
        // into view and focus; this only counts them and leads there.
        <div>
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
        <div
          role="alert"
          tabIndex={-1}
          className="flex items-start gap-2.5 rounded-control bg-danger-tint px-[calc(14*var(--ov-u))] py-2.5 text-[length:var(--ov-type-meta-small)] leading-snug font-bold text-danger-text"
        >
          <Glyph name="warn" className="glyph-20 shrink-0 text-danger-glyph" />
          <span className="min-w-0 [overflow-wrap:break-word]">{message}</span>
          {action}
        </div>
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
