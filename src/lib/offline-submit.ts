"use client";

import { unstable_rethrow } from "next/navigation";

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
 * The four ways in — sign in, sign up, forgot and reset password — are deliberately left
 * unwrapped. A form whose action is a client function loses the `method="POST"` that lets
 * it submit before the page's JavaScript arrives, and those are the pages where that
 * matters most; nothing on them can be done offline anyway, so the offline screen is the
 * honest answer there. Everything behind them holds typed work and already needs the
 * script to be usable at all.
 */
export const OFFLINE_SUBMIT_MESSAGE =
  "Connection lost. Nothing was saved, and what you typed is still here. Try again when connected.";

type Action<S> = (state: S, form: FormData) => Promise<S>;

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
      if (!neverSent(error)) throw error;
      return { ok: false, error: OFFLINE_SUBMIT_MESSAGE };
    }
  };
}

/**
 * For an action that reports a single message. Nothing submitted is echoed back: these are
 * the sign-in, password and deletion forms, and their fields are not ours to hand around.
 */
export function keepsErrorOnDisconnect<S extends { error?: string }>(action: Action<S>): Action<S> {
  return async (state, form) => {
    try {
      return await action(state, form);
    } catch (error) {
      unstable_rethrow(error);
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
 */
export async function attempted<T>(
  action: () => Promise<T>,
  whenDisconnected: string,
): Promise<{ ok: true; value: T } | { ok: false; message: string }> {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    unstable_rethrow(error);
    if (!neverSent(error)) throw error;
    return { ok: false, message: whenDisconnected };
  }
}
