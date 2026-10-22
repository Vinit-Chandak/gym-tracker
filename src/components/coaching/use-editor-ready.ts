"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/** Controlled editors must not accept input before their change handlers are attached. */
export function useEditorReady() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
