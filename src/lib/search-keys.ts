import type { KeyboardEvent } from "react";

/**
 * Enter in a search box that sits inside a form. The results already follow the typing, so Enter
 * (a phone keyboard's Search key) must not submit what has been picked so far: it does nothing
 * where a keyboard has other ways on, and puts the on-screen keyboard away on a touch screen,
 * which is what that key is pressed for there.
 */
export function holdEnter(event: KeyboardEvent<HTMLInputElement>): void {
  if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
  event.preventDefault();
  if (window.matchMedia?.("(pointer: coarse)").matches) event.currentTarget.blur();
}
