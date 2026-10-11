"use client";

import { unstable_rethrow } from "next/navigation";

import { isOutOfDate, reloadForUpdate } from "@/lib/app-update";
import { formValues, type FormState } from "@/server/validation/form";

/**
 * Forms that survive the signal dropping mid-save.
 *
 * A server action is a fetch, and a fetch with no network rejects. Nothing catches that on
 * the way out of `useActionState`, so it reaches the nearest error boundary and the whole
 * screen is replaced — taking with it everything the athlete had typed. On a form that is
 * only filled in once, after a session or a run, that is the worst possible moment to lose.
 *
 * These wrappers answer that one case the way the set logger already does: the form stays
 * exactly as it is, with its values, and says the save never left the device. Anything else
 * the action throws is passed on untouched, so a genuine server failure still reaches the
 * error boundary rather than being reported as a connection that was never the problem.
 *
 * One other failure is answered here rather than passed on: a save from a page that is older
 * than the server, after a deploy (lib/app-update). Retrying on the same page cannot work, so
 * the page is loaded afresh into the new release instead of the error screen taking its place.
 * Only a form that hands back what was typed asks first: that work is nowhere else, so the page
 * reloads when the athlete saves again, having been told.
 *
 * The four ways in — sign in, sign up, forgot and reset password — are deliberately left
 * unwrapped. A form whose action is a client function loses the `method="POST"` that lets
 * it submit before the page's JavaScript arrives, and those are the pages where that
 * matters most; nothing on them can be done offline anyway, so the offline screen is the
 * honest answer there. Everything behind them holds typed work and already needs the
 * script to be usable at all.
 */
export const OFFLINE_SUBMIT_MESSAGE =
  "Connection lost. We could not confirm the save. What you typed is still here; retry when connected.";

/** Said for the moment before the page reloads into the new release. */
export const UPDATING_MESSAGE = "Overload has been updated. Opening the new version…";

/** Said when the page cannot reload by itself, having just done so. */
export const OUT_OF_DATE_MESSAGE =
  "Overload has been updated. Close it and open it again, then retry.";

/** A form's first refusal: what was typed stays on screen until the athlete saves again. */
export const FORM_OUT_OF_DATE_MESSAGE =
  "Overload was updated while this page was open, so this was not saved. Copy anything you want to keep, then save again to reload the page.";

type Action<S> = (state: S, form: FormData) => Promise<S>;

/** Reloads into the new release where it can, and says which happened. */
function reload(): string {
  return reloadForUpdate() ? UPDATING_MESSAGE : OUT_OF_DATE_MESSAGE;
}

/**
 * Whether the request never reached the server.
 *
 * A fetch that cannot leave the device rejects with a `TypeError`; a server that answered
 * with an error sends back an `Error` carrying a digest instead. The browser's own offline
 * flag is taken first because it is certain when it is set — it can be wrong the other way,
 * reporting a connection that goes nowhere, which is why the type is checked as well.
 */
function neverSent(error: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  return error instanceof TypeError;
}

/** For an action whose state carries the form's own errors and the values to put back. */
export function keepsFormOnDisconnect<S extends FormState>(action: Action<S>): Action<S> {
  return async (state, form) => {
    try {
      return await action(state, form);
    } catch (error) {
      unstable_rethrow(error);
      if (isOutOfDate(error))
        return {
          ...state,
          fieldErrors: undefined,
          formError:
            state.formError === FORM_OUT_OF_DATE_MESSAGE ? reload() : FORM_OUT_OF_DATE_MESSAGE,
          values: formValues(form),
        };
      if (!neverSent(error)) throw error;
      return {
        ...state,
        fieldErrors: undefined,
        formError: OFFLINE_SUBMIT_MESSAGE,
        values: formValues(form),
      };
    }
  };
}

/**
 * For an action that answers with an outcome rather than a form's own state: the skip and
 * plan controls on Today, which have no fields to keep.
 */
type ActionOutcome = { ok: true } | { ok: false; error: string };
export function keepsOutcomeOnDisconnect(action: Action<ActionOutcome>): Action<ActionOutcome> {
  return async (state, form) => {
    try {
      return await action(state, form);
    } catch (error) {
      unstable_rethrow(error);
      if (isOutOfDate(error)) return { ok: false, error: reload() };
      if (!neverSent(error)) throw error;
      return { ok: false, error: OFFLINE_SUBMIT_MESSAGE };
    }
  };
}

/**
 * For an action that reports a single message. Nothing submitted is echoed back: these are
 * the sign-in, password and deletion forms, and their fields are not ours to hand around.
 * For the same reason a page older than the server reloads at once, rather than holding them.
 */
export function keepsErrorOnDisconnect<S extends { error?: string }>(action: Action<S>): Action<S> {
  return async (state, form) => {
    try {
      return await action(state, form);
    } catch (error) {
      unstable_rethrow(error);
      if (isOutOfDate(error)) return { ...state, error: reload() };
      if (!neverSent(error)) throw error;
      return { ...state, error: OFFLINE_SUBMIT_MESSAGE };
    }
  };
}

/**
 * For an action called directly rather than through a form: a set logged, an exercise
 * skipped, a proposal applied.
 *
 * The same rule as the form wrappers, and for the same reason. A bare `catch` here reported
 * every failure as a lost connection, including the one that is not a failure at all: an
 * expired sign-in makes the action redirect, and swallowing that left the athlete pressing
 * Retry against a session that had ended, told to check a connection that was fine.
 *
 * Saved from a page older than the server, the page reloads at once: these are mostly taps, and
 * the typed work among them that matters, a set being logged, is already kept on the device as
 * a draft before it is sent, and comes back after the reload.
 */
export async function attempted<T>(
  action: () => Promise<T>,
  whenDisconnected: string,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    unstable_rethrow(error);
    if (isOutOfDate(error)) return { ok: false, message: reload() };
    if (!neverSent(error)) throw error;
    return { ok: false, message: whenDisconnected };
  }
}
