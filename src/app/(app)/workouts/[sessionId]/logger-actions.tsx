"use client";

import { createContext, useContext } from "react";

import {
  applyFallbackAction,
  archiveWorkoutMachineAction,
  chooseEquipmentVariantAction,
  confirmEquipmentHereAction,
  deleteSetAction,
  equipmentNotHereAction,
  logSetAction,
  readExerciseHistoryAction,
  setExerciseCompletedAction,
  skipExerciseAction,
} from "@/server/actions/sessions";

/**
 * The server's side of logging, in one place. The app talks to the real actions; the design
 * preview (src/app/(preview)) gives the same screens answers of its own, so the moment a set is
 * written can be seen without a database. Nothing here decides anything.
 */
export type LoggerActions = {
  logSet: typeof logSetAction;
  deleteSet: typeof deleteSetAction;
  setCompleted: typeof setExerciseCompletedAction;
  skip: typeof skipExerciseAction;
  applyFallback: typeof applyFallbackAction;
  readHistory: typeof readExerciseHistoryAction;
  /** "Yes, it's here" and "Available": the machine is registered and put on the exercise. */
  confirmHere: typeof confirmEquipmentHereAction;
  notHere: typeof equipmentNotHereAction;
  chooseVariant: typeof chooseEquipmentVariantAction;
  archiveMachine: typeof archiveWorkoutMachineAction;
};

const SERVER: LoggerActions = {
  logSet: (input) => logSetAction(input),
  deleteSet: (...args) => deleteSetAction(...args),
  setCompleted: (...args) => setExerciseCompletedAction(...args),
  skip: (...args) => skipExerciseAction(...args),
  applyFallback: (...args) => applyFallbackAction(...args),
  readHistory: (...args) => readExerciseHistoryAction(...args),
  confirmHere: (...args) => confirmEquipmentHereAction(...args),
  notHere: (...args) => equipmentNotHereAction(...args),
  chooseVariant: (...args) => chooseEquipmentVariantAction(...args),
  archiveMachine: (...args) => archiveWorkoutMachineAction(...args),
};

const Context = createContext<LoggerActions>(SERVER);

export const LoggerActionsProvider = Context.Provider;

export function useLoggerActions(): LoggerActions {
  return useContext(Context);
}
