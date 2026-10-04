"use client";

import type { Route } from "next";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type CSSProperties,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";

import { ExerciseGuide } from "@/components/exercise-guide";
import { RestPill } from "@/components/shell/rest-timer";
import { Button } from "@/components/ui/button";
import { rampSize, titleSize } from "@/components/ui/fit";
import { Glyph } from "@/components/ui/glyphs";
import { Tabs } from "@/components/ui/tabs";
import { useMeasure } from "@/components/ui/use-width";
import { effortError, effortMetric, RIR_HELP, RPE_HELP } from "@/domain/effort";
import { REGRESSION_WARNING_STREAK, WORKING_SET_TYPES } from "@/domain/progression";
import { SET_LIMITS } from "@/domain/sets";
import type { LoadUnit, PrescriptionType, SetType } from "@/domain/types";
import { formatDay } from "@/lib/format";
import { NO_GUIDANCE } from "@/lib/guidance";
import { LOAD_UNIT_LABELS, SUGGESTION_KIND_LABELS } from "@/lib/labels";
import { attempted } from "@/lib/offline-submit";
import { PLATFORM_ATTRIBUTE } from "@/lib/platform";
import type { DraftValueField } from "@/lib/workout-drafts";

import { Entry, type EntryField } from "./entry";
import { ExerciseHistory } from "./exercise-history";
import { Log, setSaid, unitName, warmSaid } from "./log";
import { useLoggerActions } from "./logger-actions";
import {
  countTargetLabel,
  entryHeading,
  entrySize,
  equipmentGlyph,
  equipmentLine,
  gutterFor,
  headingText,
  isWarmup,
  logSize,
  measureOf,
  perSetLabel,
  plannedSets,
  prescriptionLabel,
  restText,
  rirTarget,
  rirTargetLabel,
  setNumber,
  supersetNext,
} from "./logger-model";
import {
  EffortSheet,
  MoreSheet,
  SetEditSheet,
  SetOptionsSheet,
  SkipSheet,
  WhySheet,
  type MoreOption,
  type WhyContent,
} from "./logger-sheets";
import { MachineDecision, MachineGoneSheet } from "./machine-decision";
import { NextLoad, nextLoadQuestion } from "./next-load";
import { useSetRows, type Ghost, type RowState } from "./use-set-rows";
import type { ExerciseVM, SessionVM, SetVM } from "./view-model";

const TABS = [
  { value: "log", label: "Log" },
  { value: "technique", label: "Technique" },
  { value: "history", label: "History" },
] as const;

type LoggerTab = (typeof TABS)[number]["value"];

/** The app's own sentences for a missing effort (src/domain/effort.ts). */
const RIR_NEEDED = effortError({
  setType: "working",
  reps: 1,
  durationSeconds: null,
  rir: null,
})!;
const RPE_NEEDED = effortError({
  setType: "working",
  reps: null,
  durationSeconds: 1,
  rir: null,
  rpe: null,
})!;
const isEffortMessage = (message: string | null) =>
  message === RIR_NEEDED ||
  message === RPE_NEEDED ||
  (message?.startsWith("Review and re-enter actual") ?? false);

const STORAGE_UNAVAILABLE =
  "Browser storage is unavailable. Keep this page open until your sets are saved.";
const AUTO_WARMUP = "Saved as a warm-up: well under today’s working weight, with no RIR.";
const DECLINE =
  "Repeated comparable decline. Keep the baseline pending coach review and reassess current recovery.";

const rirName = (value: string) =>
  value === "1" ? "1 rep in reserve" : `${value} reps in reserve`;

const noSubscription = () => () => {};

type Sheet =
  | { kind: "why" }
  | { kind: "effort" }
  | { kind: "options" }
  | { kind: "edit"; setIndex: number }
  | { kind: "more" }
  | { kind: "skip" }
  | { kind: "gone" };

/** The three fields a set is written in: load, what it counts, and effort. */
function fieldsFor(
  exercise: ExerciseVM,
  measure: PrescriptionType,
  row: RowState | null,
  unit: LoadUnit,
): [EntryField, EntryField, EntryField] {
  const loadUnit = row?.unit ?? unit;
  const bodyweight = exercise.exercise.modality === "bodyweight";
  const label = LOAD_UNIT_LABELS[loadUnit];
  const said = unitName(loadUnit);
  const step = `${exercise.weightStep} ${label}`;
  const suggested = (state: string) => (state === "suggested" ? ", suggested" : "");
  const load: EntryField = {
    field: "weight",
    unit: `${bodyweight ? "+" : ""}${label}`,
    hint: null,
    foldHint: null,
    inputLabel: said ? `Load in ${said}` : "Load",
    inputMode: "decimal",
    max: SET_LIMITS.weight,
    min: 0,
    step: exercise.weightStep,
    less: `Less load, ${step}`,
    more: `More load, ${step}`,
    name: (value, state) =>
      state === "empty"
        ? "Load not set. Type a load"
        : `${value}${said ? ` ${said}` : ""}${suggested(state)}. Type a load`,
    target: null,
    info: null,
  };
  const target = countTargetLabel(exercise, row?.setIndex ?? null);
  const count: EntryField =
    measure === "duration"
      ? {
          field: "duration",
          unit: "s",
          hint: null,
          foldHint: target ? `target ${target}` : null,
          inputLabel: "Seconds",
          inputMode: "numeric",
          max: SET_LIMITS.durationSeconds,
          min: 0,
          step: 5,
          less: "5 seconds less",
          more: "5 seconds more",
          name: (value, state) =>
            state === "empty"
              ? "Seconds not set. Type seconds"
              : `${value} seconds${suggested(state)}. Type seconds`,
          target: null,
          info: null,
        }
      : measure === "distance"
        ? {
            field: "distance",
            unit: "m",
            hint: null,
            foldHint: target ? `target ${target}` : null,
            inputLabel: "Metres",
            inputMode: "decimal",
            max: SET_LIMITS.distanceMeters,
            min: 0,
            step: 5,
            less: "5 metres less",
            more: "5 metres more",
            name: (value, state) =>
              state === "empty"
                ? "Metres not set. Type metres"
                : `${value} metres${suggested(state)}. Type metres`,
            target: null,
            info: null,
          }
        : {
            field: "reps",
            unit: "reps",
            hint: null,
            foldHint: target ? `target ${target}` : null,
            inputLabel: "Reps",
            inputMode: "numeric",
            max: SET_LIMITS.reps,
            min: 0,
            step: 1,
            less: "One rep fewer",
            more: "One rep more",
            name: (value, state) =>
              state === "empty"
                ? "Reps not set. Type reps"
                : `${value} reps${suggested(state)}. Type reps`,
            target: null,
            info: null,
          };
  const warmup = row !== null && isWarmup(row.setType);
  const effort: EntryField =
    effortMetric(measure) === "rir"
      ? (() => {
          const target = row && !warmup ? rirTarget(exercise, row.setIndex) : null;
          const targetLabel = row && !warmup ? rirTargetLabel(exercise, row.setIndex) : null;
          return {
            field: "rir",
            unit: "RIR",
            hint: warmup ? "optional" : targetLabel ? `target ${targetLabel}` : null,
            foldHint: null,
            inputLabel: "RIR",
            inputMode: "decimal",
            max: SET_LIMITS.rir,
            min: 0,
            step: 1,
            less: "One rep less in reserve",
            more: "One rep more in reserve",
            name: (value, state) =>
              state !== "empty"
                ? `${rirName(value)}. Type RIR`
                : warmup
                  ? "RIR not set, optional for a warm-up. Type RIR"
                  : targetLabel
                    ? `RIR not set, target ${targetLabel}. Use the target`
                    : "RIR not set. Type RIR",
            target,
            info: "What RIR means",
          };
        })()
      : {
          field: "rpe",
          unit: "RPE",
          hint: warmup ? "optional" : "1–10",
          foldHint: null,
          inputLabel: "RPE",
          inputMode: "decimal",
          max: SET_LIMITS.rpe,
          min: 1,
          step: 1,
          less: "RPE one lower",
          more: "RPE one higher",
          name: (value, state) =>
            state !== "empty"
              ? `RPE ${value}. Type RPE`
              : warmup
                ? "RPE not set, optional for a warm-up. Type RPE"
                : "RPE not set, 1 very easy to 10 maximal. Type RPE",
          target: null,
          info: "What RPE means",
        };
  return [load, count, effort];
}

/** What a figure shows in the entry: the value typed, or the suggestion; effort only typed. */
function shownText(row: RowState, ghost: Ghost, field: DraftValueField, effort: boolean): string {
  if (row.touched.has(field)) return row[field] || "–";
  return (effort ? undefined : ghost[field]) || "–";
}

type LoggerProps = {
  exercise: ExerciseVM;
  session: SessionVM;
  userId: string;
  readOnly: boolean;
  onBack: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onLogged: (restSeconds: number) => void;
  /** Opens the workout's superset sheet with this exercise's group. */
  onEditSuperset?: (group: string | null) => void;
};

/**
 * Logging one exercise (DESIGN.md, Logging): a full-screen layer over the tabs with its own
 * header (back to the workout, the rest pill, More), the exercise's name and range, three tabs,
 * the log under them and the entry docked at the foot. Everything here belongs to this exercise:
 * the workout's gym, programme and day are session context and are not repeated per set.
 */
export function ExerciseLogger({
  exercise,
  session,
  userId,
  readOnly,
  onBack,
  onDirtyChange,
  onLogged,
  onEditSuperset,
}: LoggerProps) {
  const actions = useLoggerActions();
  const [tab, setTab] = useState<LoggerTab>("log");
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [typing, setTyping] = useState<DraftValueField | null>(null);
  const [savedCompleted, setCompleted] = useState(exercise.completedAt !== null);
  // Completing or reopening shows at once, while the server is told; a failure puts it back.
  const [completed, showCompleted] = useOptimistic(savedCompleted);
  // Pressed while a set is still on its way: the exercise completes once that set has landed.
  const [completing, showCompleting] = useOptimistic(false);
  const [skipped, setSkipped] = useState(exercise.skippedAt !== null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // The moment a set is written: the sets that landed while this screen was open rise into
  // place, and Save reads Saved for a beat.
  const [landed, setLanded] = useState<ReadonlySet<number>>(() => new Set());
  const [flash, setFlash] = useState<number | null>(null);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  // What the status line says once the server has answered, fixed at that moment (so a later
  // edit never re-announces it) until the next save starts.
  const [announced, setAnnounced] = useState("");
  const hintId = useId();

  const layer = useRef<HTMLDivElement>(null);
  const probe = useRef<HTMLSpanElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const header = useRef<HTMLElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const dock = useRef<HTMLDivElement>(null);
  const doneHead = useRef<HTMLParagraphElement>(null);
  // Complete pressed in the message slot: focus follows the exercise to its Done line.
  const focusDone = useRef(false);
  const shownTab = useRef(tab);
  const box = useMeasure(layer, probe);
  const android = useSyncExternalStore(
    noSubscription,
    () => document.documentElement.getAttribute(PLATFORM_ATTRIBUTE) === "android",
    () => false,
  );

  const measure = measureOf(exercise);
  const effort = effortMetric(measure);
  const unit: LoadUnit = exercise.equipment?.unit ?? session.preferredUnit;
  const unitLabel = LOAD_UNIT_LABELS[unit];

  const sets = useSetRows({
    exercise,
    userId,
    sessionId: session.id,
    measure,
    unit,
    onLogged,
    onSaved: (setIndex, added, saved) => {
      setLastSaved(setIndex);
      setAnnounced(announcement(sets.rows, setIndex, added, saved));
      if (added) {
        setLanded((current) => new Set(current).add(setIndex));
        setFlash(setIndex);
      } else setSheet((current) => (current?.kind === "edit" ? null : current));
    },
  });

  useEffect(() => {
    onDirtyChange(sets.dirty);
  }, [sets.dirty, onDirtyChange]);

  // Save reads Saved for half a second, then turns to the next set's Save.
  useEffect(() => {
    if (flash === null) return;
    const timer = setTimeout(() => setFlash(null), 500);
    return () => clearTimeout(timer);
  }, [flash]);

  // The set that lands is brought into view. Where the title, tabs and log scroll together
  // (200% text, a screen too short for a line of the log) it would otherwise land out of sight
  // under the entry; there the log is kept at its end (DESIGN.md, Logging), while the screen
  // still opens on the exercise's name.
  useEffect(() => {
    if (flash === null) return;
    layer.current?.querySelector(`[data-set="${flash}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [flash]);

  // While a figure is typed, the layer is the visual viewport, so the entry and Save stand
  // above the keyboard.
  useEffect(() => {
    const element = layer.current;
    const viewport = window.visualViewport;
    if (typing === null || !element || !viewport) return;
    const sync = () => {
      element.style.setProperty("--session-top", `${viewport.offsetTop}px`);
      element.style.setProperty("--session-height", `${viewport.height}px`);
    };
    sync();
    viewport.addEventListener("resize", sync);
    viewport.addEventListener("scroll", sync);
    return () => {
      viewport.removeEventListener("resize", sync);
      viewport.removeEventListener("scroll", sync);
      element.style.removeProperty("--session-top");
      element.style.removeProperty("--session-height");
    };
  }, [typing]);

  const editable = !readOnly && !skipped && !completed;
  const entryRow = editable ? (sets.rows.find((row) => row.logged === null) ?? null) : null;
  const heading = entryRow ? entryHeading(sets.rows, entryRow, exercise) : null;
  const ghost = entryRow ? sets.ghost(entryRow.setIndex) : {};
  const fields = fieldsFor(exercise, measure, entryRow, unit);

  // The log's soft top edge shows once its earlier lines pass under the tabs.
  const [overflow, setOverflow] = useState(false);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    // The observer reports once as it starts, and again whenever the log or its frame resizes.
    const check = () => setOverflow(element.scrollHeight > element.clientHeight + 1);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(check);
    observer.observe(element);
    if (element.firstElementChild) observer.observe(element.firstElementChild);
    return () => observer.disconnect();
  }, [tab]);

  // ---------- sizes: the figures fit their columns at the reader's text size ----------
  const scale = box.root / 16;
  const figureGrow = 0.5 + 0.5 * scale;
  const logGrow = 0.75 + 0.25 * scale;
  const titleGrow = 0.25 + 0.75 * scale;
  // Text so large that three columns cannot hold folds the entry (session.css, 14rem).
  const folded = box.width < 14 * box.root;
  const content = box.width - 2 * gutterFor(box.width);
  const target = (android ? 48 : 44) + Math.max(0, 1.25 * box.root - 20);
  const size =
    folded || !entryRow
      ? 42
      : entrySize(
          fields.map((field) => shownText(entryRow, ghost, field.field, field.info !== null)),
          box.width,
          figureGrow,
        );
  const loads = sets.loggedSets
    .filter((set) => !isWarmup(set.setType))
    .map((set) => (set.weight === null ? "–" : String(set.weight)));
  const lineSize = folded ? 32 : logSize(loads, box.width, logGrow);
  const titleBase = box.width < 360 ? 28 : box.height < 800 ? 30 : 32;
  const titlePx = folded
    ? titleBase
    : titleSize(exercise.exercise.name, content / titleGrow, titleBase);

  // ---------- room: a short screen folds the log, a very short one lets the entry scroll ----------
  const [room, setRoom] = useState<{ tight: boolean; spill: boolean }>({
    tight: false,
    spill: false,
  });
  const oneLine = Math.max(44, lineSize * logGrow * 1.8) + 16;
  const hasLog = sets.loggedSets.length > 0;
  useLayoutEffect(() => {
    const layerEl = layer.current;
    const headerEl = header.current;
    const bodyEl = body.current;
    // The log and the entry stay mounted under the other tabs, hidden: measured on Log only.
    if (tab !== "log" || !layerEl || !headerEl || !bodyEl) return;
    const measureRoom = () => {
      const inset = parseFloat(getComputedStyle(layerEl).paddingTop) || 0;
      const available = layerEl.clientHeight - inset - headerEl.offsetHeight;
      const docked = dock.current?.offsetHeight ?? 0;
      const frameEl = frame.current;
      const above = frameEl
        ? frameEl.getBoundingClientRect().top -
          bodyEl.getBoundingClientRect().top +
          bodyEl.scrollTop
        : 0;
      const spill = docked > available;
      // Tight: the log cannot show its latest line between the tabs and the entry; or, before
      // the first set, what stands over the log (the coach's note, a machine to choose) does
      // not fit above the entry at all, which left the dock covering it on a 320 × 568 phone.
      const tight =
        !spill && frameEl !== null && available - docked - above < (hasLog ? oneLine : -1);
      setRoom((current) =>
        current.spill === spill && current.tight === tight ? current : { spill, tight },
      );
    };
    measureRoom();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measureRoom);
    for (const element of [layerEl, headerEl, dock.current, ...bodyEl.children])
      if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [oneLine, hasLog, tab]);

  // Tight (a short screen at the reader's usual size), the title, tabs and log scroll together;
  // they are kept at their end, so the latest set stays in view above the entry as it does when
  // the log scrolls alone. Folded at 200%, the screen opens on the exercise's name instead
  // (board Log-200), and each set that lands is brought into view as it lands.
  useEffect(() => {
    const element = body.current;
    // Before the first set there is no latest line to keep in view: the screen opens on the name.
    if (room.tight && !folded && hasLog && element) element.scrollTop = element.scrollHeight;
  }, [room.tight, folded, hasLog]);

  // A tab that opens shows its tabs, scrolled back to them where the title, tabs and log scroll
  // together; the Log comes back at its latest set, above the entry, as it stands after a set
  // lands. The screen still opens on the exercise's name.
  useLayoutEffect(() => {
    const bodyEl = body.current;
    if (shownTab.current === tab || !bodyEl) return;
    shownTab.current = tab;
    if (tab === "log") {
      const lines = bodyEl.querySelectorAll(".log [data-set]");
      lines[lines.length - 1]?.scrollIntoView?.({ block: "nearest" });
      return;
    }
    const tabsEl = bodyEl.querySelector(".session-tabs");
    if (!tabsEl) return;
    const top =
      tabsEl.getBoundingClientRect().top - bodyEl.getBoundingClientRect().top + bodyEl.scrollTop;
    if (bodyEl.scrollTop > top) bodyEl.scrollTop = top;
  }, [tab]);

  // Complete pressed in the slot takes the slot with it: once the exercise reads Done, focus goes
  // to that line.
  useEffect(() => {
    if (!focusDone.current || !doneHead.current) return;
    focusDone.current = false;
    doneHead.current.focus();
  }, [completing, completed]);

  // ---------- what the header and the meta line say ----------
  const dayName = session.day?.name ?? "Ad hoc session";
  const plannedName = exercise.planned?.plannedExerciseName;
  const substituted = plannedName !== undefined && plannedName !== exercise.exercise.name;
  const glyph = equipmentGlyph(exercise);
  const equipment = equipmentLine(exercise);
  const range = tab === "log" ? perSetLabel(exercise) : prescriptionLabel(exercise, unitLabel);
  const rest = restText(exercise);
  const facts: ReactNode[] = [
    <>
      <Glyph name={glyph} label={equipment} className="glyph-16" />
      <span>{range ?? equipment}</span>
    </>,
  ];
  if (rest)
    facts.push(
      <>
        <Glyph name="rest" className="glyph-16" />
        <span>{rest}</span>
      </>,
    );
  // A machine of this gym, or the lack of one, is said in words: the glyph says only its kind.
  if (range !== null && (exercise.equipment || equipment === "Machine not chosen"))
    facts.push(<span>{exercise.equipment ? `on ${equipment}` : equipment}</span>);
  if (substituted) facts.push(<span>instead of {plannedName}</span>);

  // ---------- the suggestion, its tag and Why ----------
  const suggestion = exercise.suggestion;
  const kindLabel = suggestion ? SUGGESTION_KIND_LABELS[suggestion.kind] : null;
  const bodyweight = exercise.exercise.modality === "bodyweight";
  const countField = fields[1].field;
  const whyLoad = ghost.weight && !(bodyweight && Number(ghost.weight) === 0) ? ghost.weight : null;
  const whyCount = ghost[countField]
    ? `${ghost[countField]}${measure === "duration" ? " s" : measure === "distance" ? " m" : ""}`
    : null;
  const whyEffort =
    entryRow && effort === "rir" ? rirTargetLabel(exercise, entryRow.setIndex) : null;
  const why: WhyContent | null =
    suggestion && kindLabel
      ? {
          tag: kindLabel,
          figures: { load: whyLoad, unit: unitLabel, count: whyCount, effort: whyEffort },
          reason:
            suggestion.kind === "coach" && exercise.coachNote ? null : suggestion.reason || null,
          advice: suggestion.advice,
          coachNote: exercise.coachNote,
          warning: null,
          basis: exercise.basis
            ? `Based on ${
                suggestion.basis === "other_equipment"
                  ? `${exercise.basis.equipmentName ?? "another machine"} at ${exercise.basis.gymName}`
                  : "this exercise"
              }, ${formatDay(exercise.basis.performedAt, session.timeZone)}.`
            : null,
        }
      : null;
  const tagName =
    kindLabel &&
    `${kindLabel}: why ${[
      whyLoad ? `${whyLoad} ${unitName(unit) || unitLabel}` : null,
      whyCount ?? null,
    ]
      .filter(Boolean)
      .join(" × ")}`.trim();

  // ---------- completing, skipping, a fallback ----------
  const needsDecision = exercise.decision !== null && !skipped && !readOnly;
  // Once this exercise's working sets are in, a stack whose next stop nobody knows asks for
  // it under the sets (ADR 0028); nothing is asked mid-exercise or of plates.
  const loggedWorking = sets.loggedSets.filter((set) => WORKING_SET_TYPES.has(set.setType));
  const workingDone =
    completed ||
    (!sets.dirty &&
      loggedWorking.length > 0 &&
      loggedWorking.length >= (exercise.planned?.sets ?? 1));
  const nextLoad =
    !readOnly && !skipped && measure === "reps" && workingDone
      ? nextLoadQuestion(
          exercise.equipment?.ladder,
          loggedWorking.map((set) => set.weight),
        )
      : null;

  const setCompletedState = (value: boolean) =>
    startTransition(async () => {
      if (value) {
        showCompleting(true);
        // A set that did not save keeps the exercise open, its row saying why.
        if (!(await sets.settled())) return;
        startTransition(() => showCompleted(true));
      } else {
        showCompleted(false);
        sets.ensureOpenRow();
      }
      const outcome = await attempted(
        () => actions.setCompleted(exercise.id, value),
        "Connection lost. Your entries are still here. Try again when connected.",
      );
      if (!outcome.ok) {
        setMessage(outcome.message);
        return;
      }
      if (!outcome.value.ok) {
        setMessage(outcome.value.error);
        return;
      }
      setMessage(null);
      setCompleted(value);
      setSkipped(false);
      setAnnounced(value ? `${exercise.exercise.name} done.` : "");
    });

  const skip = (reason: string) =>
    startTransition(async () => {
      const outcome = await attempted(
        () => actions.skip(exercise.id, reason.trim() || null),
        "Connection lost. Try again when connected.",
      );
      if (!outcome.ok) {
        setMessage(outcome.message);
        return;
      }
      if (!outcome.value.ok) {
        setMessage(outcome.value.error);
        return;
      }
      setMessage(null);
      setSkipped(true);
      setSheet(null);
    });

  const applyFallback = (exerciseId: string, instanceId: string | null, name: string) =>
    startTransition(async () => {
      const outcome = await attempted(
        () =>
          actions.applyFallback(
            exercise.id,
            exerciseId,
            instanceId,
            `Fallback at ${session.gym.name}: ${exercise.exercise.name} → ${name}`,
          ),
        "Connection lost. Try again when connected.",
      );
      if (!outcome.ok) setMessage(outcome.message);
      else if (!outcome.value.ok) setMessage(outcome.value.error);
    });

  // ---------- the entry's edits and Save ----------
  const editEntry = (patch: Partial<RowState>, touch: DraftValueField) => {
    if (!entryRow) return;
    // Entering the effort Save was waiting for clears the sentence that asked for it.
    const clears =
      (touch === "rir" || touch === "rpe") && isEffortMessage(entryRow.error)
        ? { error: null }
        : {};
    sets.editRow(entryRow, { ...patch, ...clears }, touch);
  };

  const startTyping = (field: DraftValueField) => {
    // The inputs must exist before the focus moves to one, inside the tap, or iOS keeps its
    // keyboard down.
    flushSync(() => setTyping(field));
  };

  const effortValue = (row: RowState) =>
    row.touched.has(effort) && row[effort].trim() !== "" ? row[effort] : null;
  const waitingForEffort =
    entryRow !== null && !isWarmup(entryRow.setType) && effortValue(entryRow) === null;
  const alert =
    entryRow !== null && (entryRow.error === RIR_NEEDED || entryRow.error === RPE_NEEDED);

  const save = () => {
    if (!entryRow || entryRow.saving) return;
    setAnnounced("");
    sets.logRow(entryRow);
    setTyping(null);
  };

  // The plan's sets are all in: news, said once over the entry with Complete beside it, which
  // is otherwise in More. Further sets are still saved as the entry offers them.
  const planned = plannedSets(exercise);
  const workDone = sets.loggedSets.filter((set) => !isWarmup(set.setType)).length;
  const planDone = editable && planned !== null && planned > 0 && workDone >= planned;
  const planDoneText =
    planned === null ? "" : `${planned} of ${planned} ${planned === 1 ? "set" : "sets"} done.`;

  // Saving…, Saved and the set that lands are said as well as drawn (WCAG 4.1.3), on one status
  // line that stays on the page: "Saving set 3" while the server answers, then "Set 3 saved: 60
  // kilograms, 4 reps, 2 reps in reserve. Set 4 of 4 next." A save that fails is the slot's
  // alert instead.
  function announcement(
    rows: readonly RowState[],
    setIndex: number,
    added: boolean,
    saved: { set: SetVM; autoWarmup: boolean },
  ): string {
    const after = rows.map((row) =>
      row.setIndex === setIndex
        ? { ...row, setType: saved.set.setType, logged: saved.set, saving: false }
        : row,
    );
    const row = after.find((r) => r.setIndex === setIndex);
    if (!row) return "";
    const warm = isWarmup(saved.set.setType);
    const n = setNumber(after, row);
    if (!added) return warm ? "Warm-up updated." : `Set ${n} updated.`;
    const said = saved.autoWarmup
      ? AUTO_WARMUP
      : `${(warm ? warmSaid(saved.set, measure) : setSaid(n, saved.set, measure)).replace(
          ":",
          " saved:",
        )}.`;
    const work = after.filter((r) => r.logged && !isWarmup(r.logged.setType)).length;
    // The entry turns to the first set not yet done, or to a working set after the last one, as
    // use-set-rows adds it on the same answer.
    const open = after.find((r) => r.logged === null);
    const last = Math.max(...after.map((r) => r.setIndex));
    const nextRow =
      open ??
      (setIndex === last
        ? { ...row, setIndex: last + 1, setType: "working" as const, logged: null }
        : null);
    const rowsNext = nextRow && !open ? [...after, nextRow] : after;
    const next =
      !warm && planned !== null && planned > 0 && work === planned
        ? planDoneText
        : nextRow
          ? `${headingText(entryHeading(rowsNext, nextRow, exercise))} next.`
          : "";
    return `${said} ${next}`.trim();
  }
  const savingRow = sets.rows.find((row) => row.saving && !row.logged) ?? null;
  const spoken = savingRow
    ? `Saving ${isWarmup(savingRow.setType) ? "warm-up" : `set ${setNumber(sets.rows, savingRow)}`}`
    : announced;

  const autoWarmupRow =
    lastSaved === null
      ? null
      : (sets.rows.find(
          (row) =>
            row.setIndex === lastSaved && row.autoWarmup && row.setType === "warmup" && !row.dirty,
        ) ?? null);
  const partner = supersetNext(session, exercise);
  const partnerLine = partner
    ? prescriptionLabel(partner, LOAD_UNIT_LABELS[partner.equipment?.unit ?? session.preferredUnit])
    : null;

  // The one message slot, at the head of the entry: every message about Save stands here, and
  // the entry grows upwards from Save, so neither Save nor a stepper moves when one comes or
  // goes. Only the entry's own sentence describes Save; the others stand in the slot unnamed.
  const slotMessage = (
    glyphName: "info" | "warn",
    text: string,
    role: "alert" | "status",
    id?: string,
  ) => (
    <p id={id} role={role} className="entry-slot entry-slot-message">
      <Glyph name={glyphName} className="mt-px glyph-18" />
      <span className="min-w-0 [overflow-wrap:anywhere]">{text}</span>
    </p>
  );
  const slot: ReactNode = entryRow?.error ? (
    slotMessage(isEffortMessage(entryRow.error) ? "info" : "warn", entryRow.error, "alert", hintId)
  ) : message ? (
    slotMessage("warn", message, "alert")
  ) : autoWarmupRow ? (
    // Said on the status line as the set lands; drawn here with its way back.
    <p className="entry-slot entry-slot-message">
      <Glyph name="info" className="mt-px glyph-18" />
      <span className="min-w-0">
        {AUTO_WARMUP}{" "}
        <button
          type="button"
          className="entry-slot-action"
          aria-label={`Set ${setNumber(sets.rows, { ...autoWarmupRow, setType: "working" })} was a working set`}
          onClick={() => {
            sets.undoWarmup(autoWarmupRow);
            setSheet({ kind: "edit", setIndex: autoWarmupRow.setIndex });
          }}
        >
          Undo
        </button>
      </span>
    </p>
  ) : sets.storageError ? (
    slotMessage("warn", STORAGE_UNAVAILABLE, "alert")
  ) : planDone ? (
    <p className="entry-slot entry-slot-message">
      <Glyph name="check" className="mt-px glyph-18" />
      <span className="min-w-0">
        {planDoneText}{" "}
        <button
          type="button"
          className="entry-slot-action"
          aria-label={`Complete ${exercise.exercise.name}`}
          disabled={pending}
          onClick={() => {
            focusDone.current = true;
            setCompletedState(true);
          }}
        >
          Complete
        </button>
      </span>
    </p>
  ) : partner ? (
    <p
      className="entry-slot entry-slot-next"
      aria-label={`Superset: after each set, ${partner.exercise.name}${
        partnerLine ? `, ${partnerLine}` : ""
      }`}
    >
      <Glyph name="link" className="glyph-18 text-ink-2" />
      <span className="font-bold">Then {partner.exercise.name}</span>
      {partnerLine && (
        <span className="type-meta-small text-ink-2 tabular-nums">{partnerLine}</span>
      )}
    </p>
  ) : null;
  const quietHint =
    waitingForEffort && !entryRow?.error ? (
      <span id={hintId} className="sr-only">
        {effort === "rir" ? RIR_NEEDED : RPE_NEEDED}
      </span>
    ) : null;

  const saveButton = (() => {
    if (!entryRow) return null;
    if (completing)
      return (
        <Button variant="waiting" size="lg" className="w-full" aria-disabled>
          Completing…
        </Button>
      );
    if (entryRow.saving)
      return (
        <Button variant="waiting" size="lg" className="w-full" aria-disabled>
          Saving…
        </Button>
      );
    if (flash !== null)
      return (
        <Button variant="waiting" size="lg" className="w-full text-ink" aria-disabled>
          <Glyph name="check" className="glyph-20" />
          Saved
        </Button>
      );
    if (waitingForEffort)
      return (
        <Button
          variant="waiting"
          size="lg"
          className="w-full"
          aria-disabled
          aria-describedby={hintId}
          onClick={save}
        >
          Save
        </Button>
      );
    const which = heading?.kind === "warmup" ? `warm-up ${heading.n}` : `set ${heading?.n ?? ""}`;
    return entryRow.error ? (
      <Button size="lg" className="w-full" aria-label={`Retry saving ${which}`} onClick={save}>
        Retry
      </Button>
    ) : (
      <Button size="lg" className="w-full" onClick={save}>
        Save
      </Button>
    );
  })();

  // ---------- sheets ----------
  const editRow =
    sheet?.kind === "edit"
      ? (sets.rows.find((row) => row.setIndex === sheet.setIndex) ?? null)
      : null;
  const editTitle = editRow
    ? isWarmup(editRow.setType)
      ? `Warm-up ${sets.rows.filter((row) => isWarmup(row.setType) && row.setIndex <= editRow.setIndex).length}`
      : `Set ${setNumber(sets.rows, editRow)}`
    : "Set";
  const optionsTitle = heading
    ? `${heading.kind === "warmup" ? "Warm-up" : "Set"} ${heading.n}`
    : "Set";

  const more: MoreOption[] = [];
  if (!readOnly && !skipped) {
    if (completed)
      more.push({
        glyph: "undo",
        label: "Reopen",
        onSelect: () => setCompletedState(false),
        disabled: pending,
      });
    else
      more.push({
        glyph: "check",
        label: "Complete",
        onSelect: () => setCompletedState(true),
        // A set still saving does not hold it up: the press waits for the save. A row with
        // unsaved changes does, as it would otherwise be left behind.
        disabled: pending || (sets.loggedSets.length === 0 && !sets.saving) || sets.editing,
      });
  }
  if (!readOnly && onEditSuperset)
    more.push({
      glyph: "link",
      label: "Superset",
      onSelect: () => onEditSuperset(exercise.supersetGroup),
    });
  if (!readOnly && !completed && !skipped && sets.loggedSets.length === 0 && !sets.dirty)
    more.push({
      glyph: "swap",
      label: "Choose a fallback",
      href: `/workouts/${session.id}/exercises/${exercise.id}/substitute` as Route,
    });
  // A registered machine that is missing or broken today: has it gone, or is it out of use?
  if (exercise.equipment && !readOnly && !completed && !skipped && sets.loggedSets.length === 0)
    more.push({
      glyph: "warn",
      label: `${exercise.equipment.name} not here`,
      onSelect: () => setSheet({ kind: "gone" }),
      disabled: pending || sets.dirty,
    });
  if (!readOnly && skipped)
    more.push({ glyph: "undo", label: "Unskip", onSelect: () => setCompletedState(false) });
  if (!readOnly && !completed && !skipped && sets.loggedSets.length === 0)
    more.push({
      glyph: "skip",
      label: "Skip exercise",
      onSelect: () => setSheet({ kind: "skip" }),
      disabled: pending || sets.dirty,
      apart: true,
    });

  const effortHelp =
    effort === "rir"
      ? `${exercise.exercise.rirNote ?? RIR_HELP}${
          exercise.planned && (exercise.planned.rirMin !== null || exercise.planned.rirMax !== null)
            ? ` Today's target is ${rirTargetLabel(exercise, entryRow?.setIndex ?? 0)} RIR.`
            : ""
        }`
      : RPE_HELP;

  const layerStyle = {
    "--session-title": rampSize(titlePx, 0.75),
  } as CSSProperties;

  return (
    <div
      ref={layer}
      className="session-layer"
      data-typing={typing !== null}
      data-folded={folded}
      data-tight={tab === "log" && room.tight}
      data-spill={tab === "log" && room.spill}
      style={layerStyle}
    >
      <span ref={probe} aria-hidden className="session-probe" />
      <h1 className="sr-only">{exercise.exercise.name}</h1>
      <p role="status" className="sr-only">
        {spoken}
      </p>
      <header ref={header} className="session-header">
        <button type="button" onClick={onBack} className="session-back">
          <Glyph name="chevronLeft" className="glyph-22" />
          <span>{dayName}</span>
        </button>
        <span className="flex-1" />
        {session.restTimerEnabled && <RestPill sessionId={session.id} />}
        {more.length > 0 && (
          <button
            type="button"
            aria-haspopup="dialog"
            aria-label="Complete, skip, superset, substitute"
            className="session-icon-button -mr-2.5"
            onClick={() => setSheet({ kind: "more" })}
          >
            <Glyph name="more" className="glyph-24" />
          </button>
        )}
      </header>

      <div ref={body} className="session-body" data-scroll={tab !== "log"}>
        <h2 className="session-title">{exercise.exercise.name}</h2>
        <p className="session-meta">
          {facts.map((fact, index) => (
            <span key={index} className="session-fact">
              {fact}
            </span>
          ))}
        </p>
        <div className="session-tabs">
          <Tabs
            name="exercise"
            label="Exercise detail"
            options={TABS}
            value={tab}
            onChange={(value) => {
              setTyping(null);
              setTab(value);
            }}
          />
        </div>

        <div
          id="exercise-panel"
          role="tabpanel"
          aria-labelledby={`exercise-${tab}-tab`}
          className="session-panel"
          data-tab={tab}
        >
          {/* The log stays mounted under the other tabs, hidden, so coming back to it is a
              switch rather than a rebuild of the log and the entry. */}
          <div hidden={tab !== "log"} className="contents">
            {/* Equipment problems come before the sets: without a machine there is nothing
                  meaningful to log, so the decision is the first thing offered. */}
            {needsDecision && exercise.decision && (
              <MachineDecision
                exercise={exercise}
                session={session}
                blocked={sets.dirty}
                busy={pending}
                onFallback={applyFallback}
                onMessage={setMessage}
              />
            )}

            {exercise.coachNote && editable && (
              <aside
                aria-label="From the coach"
                className="mt-2 rounded-control bg-surface px-3.5 py-3"
              >
                <p className="flex items-center gap-1.5 type-caption text-ink">
                  <Glyph name="coach" className="glyph-16" />
                  Coach
                </p>
                <p className="mt-1 line-clamp-2 type-body">{exercise.coachNote}</p>
                {why && exercise.coachNote.length > 76 && (
                  <button
                    type="button"
                    aria-haspopup="dialog"
                    className="-my-2.5 -ml-1.5 min-h-11 min-w-11 px-1.5 font-bold"
                    onClick={() => setSheet({ kind: "why" })}
                  >
                    More
                  </button>
                )}
              </aside>
            )}

            {skipped && (
              <p className="mt-3 type-body text-ink-2">
                Skipped{exercise.notes ? `: ${exercise.notes}` : ""}.
              </p>
            )}

            {(readOnly || completed || skipped) && sets.dirty && (
              <div className="mt-2 space-y-2 rounded-control bg-surface px-3.5 py-3">
                <p className="flex items-start gap-1.5 type-meta-small font-semibold">
                  <Glyph name="warn" className="mt-0.5 glyph-16" />
                  {readOnly
                    ? "This workout is finished, so these entries cannot be saved here."
                    : "Unsaved drafts on this device. Reopen the exercise to retry saving."}
                </p>
                {sets.rows
                  .filter((row) => row.dirty)
                  .map((row) => (
                    <div key={row.setIndex} className="type-meta-small">
                      <p className="tabular-nums">
                        Set {row.setIndex}: {row.weight || "—"} {unitLabel} ·{" "}
                        {measure === "duration"
                          ? `${row.duration || "—"} s`
                          : measure === "distance"
                            ? `${row.distance || "—"} m`
                            : `${row.reps || "—"} reps`}{" "}
                        · {effort === "rir" ? `RIR ${row.rir || "—"}` : `RPE ${row.rpe || "—"}`}
                      </p>
                      <Button
                        variant="text"
                        size="sm"
                        className="-ml-2.5"
                        onClick={() => sets.restore(row)}
                      >
                        Discard this local draft
                      </Button>
                    </div>
                  ))}
              </div>
            )}

            <div ref={frame} className="log-frame" data-overflow={overflow}>
              <div ref={scroller} className="log-scroll">
                <Log
                  rows={sets.rows}
                  measure={measure}
                  size={lineSize}
                  landed={landed}
                  onOpen={
                    editable
                      ? (row) => setSheet({ kind: "edit", setIndex: row.setIndex })
                      : undefined
                  }
                >
                  {nextLoad && exercise.equipment && (
                    <div className="pt-2 pb-1">
                      <NextLoad
                        key={`${exercise.equipment.id}:${nextLoad.from}`}
                        equipmentInstanceId={exercise.equipment.id}
                        from={nextLoad.from}
                        guess={nextLoad.guess}
                        unitLabel={unitLabel}
                        assisted={exercise.equipment.ladder?.assisted ?? false}
                      />
                    </div>
                  )}
                </Log>
              </div>
              <span aria-hidden className="log-edge" />
            </div>
          </div>

          {tab === "technique" && (
            <div className="pb-6">
              {/* The exercise's guide, the same as the library's, then the programme's cue
                  (plan: Technique). The programme's load and progression notes and the
                  substitution reason are not repeated here: the line under the name says
                  "instead of", and the notes stay in the programme. */}
              <ExerciseGuide
                guidance={exercise.guidance ?? NO_GUIDANCE}
                programmeCue={exercise.planned?.keyCue ?? null}
                libraryHref={`/exercises/${exercise.exercise.id}` as Route}
              />
            </div>
          )}

          {tab === "history" && (
            <div className="pb-6">
              {exercise.regressionStreak >= REGRESSION_WARNING_STREAK && (
                <p className="mt-3 flex items-start gap-1.5 type-meta-small font-semibold">
                  <Glyph name="warn" className="mt-0.5 glyph-16" />
                  <span>{DECLINE}</span>
                </p>
              )}
              <ExerciseHistory
                exerciseId={exercise.exercise.id}
                workoutExerciseId={exercise.id}
                loadPortability={exercise.exercise.loadPortability}
                preferredUnit={session.preferredUnit}
                timeZone={session.timeZone}
                measure={measure}
                width={box.width}
                grow={logGrow}
              />
            </div>
          )}
        </div>
      </div>

      {!readOnly && (
        <div ref={dock} hidden={tab !== "log"} className="entry-dock">
          {entryRow && heading ? (
            <Entry
              row={entryRow}
              heading={heading}
              ghost={ghost}
              measure={measure}
              fields={fields}
              size={size}
              tag={
                why && tagName && suggestion?.kind !== undefined
                  ? { label: kindLabel!, name: tagName, onOpen: () => setSheet({ kind: "why" }) }
                  : null
              }
              typing={typing}
              metrics={{ figure: size * figureGrow, target }}
              alert={alert}
              onEdit={editEntry}
              onType={startTyping}
              onTypingEnd={() => setTyping(null)}
              onOptions={() => setSheet({ kind: "options" })}
              onInfo={() => setSheet({ kind: "effort" })}
              slot={slot}
            >
              {quietHint}
              {saveButton}
            </Entry>
          ) : completed || skipped || completing ? (
            <section aria-label={exercise.exercise.name} className="entry">
              {message && slotMessage("warn", message, "alert")}
              <div className="entry-head">
                <p ref={doneHead} tabIndex={-1} className="flex items-center gap-2 type-heading">
                  {completed && <Glyph name="check" className="glyph-20" />}
                  {completed ? "Done" : skipped ? "Skipped" : ""}
                </p>
              </div>
              <div className="entry-save">
                {completing && !completed ? (
                  <Button variant="waiting" size="lg" className="w-full" aria-disabled>
                    Completing…
                  </Button>
                ) : (
                  <Button
                    variant="tonal"
                    size="lg"
                    className="w-full"
                    onClick={() => setCompletedState(false)}
                    disabled={pending}
                  >
                    {completed ? "Reopen" : "Unskip"}
                  </Button>
                )}
              </div>
            </section>
          ) : editable ? (
            <section aria-label="Sets" className="entry">
              {message && slotMessage("warn", message, "alert")}
              <div className="entry-save">
                <Button
                  variant="tonal"
                  size="lg"
                  className="w-full"
                  disabled={!sets.canAddRow}
                  onClick={sets.addRow}
                >
                  <Glyph name="plus" className="glyph-18" />
                  Add set
                </Button>
              </div>
            </section>
          ) : null}
        </div>
      )}

      <WhySheet open={sheet?.kind === "why"} why={why} onClose={() => setSheet(null)} />
      <EffortSheet
        open={sheet?.kind === "effort"}
        title={effort === "rir" ? "What RIR means" : "What RPE means"}
        text={effortHelp}
        onClose={() => setSheet(null)}
      />
      <SetOptionsSheet
        row={sheet?.kind === "options" ? entryRow : null}
        title={optionsTitle}
        canAdd={sets.canAddRow}
        onType={(row, setType: SetType) => sets.editRow(row, { setType })}
        onAdd={sets.addRow}
        onRemove={sets.removeRow}
        onClose={() => setSheet(null)}
      />
      <SetEditSheet
        row={editRow}
        title={editTitle}
        fields={editRow ? fieldsFor(exercise, measure, editRow, unit) : []}
        onUpdate={(row) => {
          setAnnounced("");
          sets.logRow(row);
        }}
        onDelete={sets.removeRow}
        onDiscard={sets.restore}
        onClose={() => {
          // A sentence about a change that never left the sheet goes with it; a change that
          // did not reach the server stays with its set.
          if (editRow && !editRow.dirty && editRow.error && !editRow.saving) sets.restore(editRow);
          setSheet(null);
        }}
      />
      <MoreSheet open={sheet?.kind === "more"} options={more} onClose={() => setSheet(null)} />
      <SkipSheet
        open={sheet?.kind === "skip"}
        name={exercise.exercise.name}
        pending={pending}
        onSkip={skip}
        onClose={() => setSheet(null)}
      />
      <MachineGoneSheet
        open={sheet?.kind === "gone"}
        exercise={exercise}
        session={session}
        onClose={() => setSheet(null)}
        onMessage={setMessage}
      />
    </div>
  );
}
