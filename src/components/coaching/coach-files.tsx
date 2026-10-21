"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { unstable_rethrow } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/input";
import { Paperclip } from "@/components/ui/icons";
import { MAX_COACH_FILE_BYTES, MAX_REQUEST_FILES } from "@/domain/coaching-workflow";
import { cn } from "@/lib/utils";
import { removeCoachAttachmentAction } from "@/server/actions/coaching-workflow";

import { coachingAction } from "./client-action";

/**
 * Reports and plans: the files an athlete keeps for the coach, whichever sport they are asking
 * for. They are the account's, not one programme's, so a watch export added while asking for a
 * running programme is there to tick when asking for a ride; each request carries the ones
 * ticked, and reviews read them all until they are removed.
 */
export type CoachFile = { id: string; name: string; mimeType: string; sizeBytes: number };

/** What a file is, when the browser declines to say. Ordered; the first match wins. */
const TYPE_BY_SUFFIX: readonly (readonly [RegExp, string])[] = [
  [/\.md$/i, "text/markdown"],
  [/\.csv$/i, "text/csv"],
  [/\.txt$/i, "text/plain"],
];

/**
 * Keeps the chosen files, one at a time, after what the browser can check itself: how many one
 * request carries and how large each is. Each file is handed back as it is kept, so one refused
 * part way leaves those before it kept and attached.
 */
export async function sendCoachFiles(
  selected: FileList,
  attached: number,
  onKept: (file: CoachFile) => void,
) {
  if (selected.length + attached > MAX_REQUEST_FILES) throw new Error("Attach up to five files.");
  for (const file of Array.from(selected)) {
    if (file.size > MAX_COACH_FILE_BYTES) throw new Error(`${file.name} is larger than 5 MB.`);
    // A browser that names no type for an export still gets the right one from its suffix,
    // which is the usual case for the .csv a tracking app or a watch hands over.
    const mime = file.type || TYPE_BY_SUFFIX.find(([suffix]) => suffix.test(file.name))?.[1] || "";
    const response = await fetch("/api/coaching/attachments", {
      method: "POST",
      headers: { "Content-Type": mime, "X-File-Name": encodeURIComponent(file.name) },
      body: file,
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "The upload failed.");
    onKept(result.file);
  }
}

/**
 * The files and which of them go with this request, for a form that saves when asked to (a run,
 * ride or swim's questions). Adding a file keeps it at once and ticks it; Remove deletes it from
 * the account, as it does wherever the files are listed. `onChange` hears every change to the
 * ticks, so the form can drop a "saved" it no longer means.
 */
export function useCoachFiles(reports: CoachFile[], initial: string[], onChange?: () => void) {
  const [files, setFiles] = useState(reports);
  const [attached, setAttached] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The ticks as they stand, for a file kept after an await.
  const current = useRef(initial);
  const changed = useRef(onChange);
  useEffect(() => {
    changed.current = onChange;
  });
  const tick = (next: string[]) => {
    current.current = next;
    setAttached(next);
    setError(null);
    changed.current?.();
  };

  async function upload(selected: FileList | null) {
    if (!selected?.length) return;
    setBusy(true);
    setError(null);
    try {
      await sendCoachFiles(selected, current.current.length, (file) => {
        setFiles((previous) => [...previous, file]);
        tick([...current.current, file.id]);
      });
    } catch (e) {
      unstable_rethrow(e);
      setError(e instanceof Error ? e.message : "The upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(file: CoachFile) {
    setBusy(true);
    setError(null);
    const result = await coachingAction(() => removeCoachAttachmentAction(file.id));
    if (result.ok) {
      setFiles((previous) => previous.filter((entry) => entry.id !== file.id));
      tick(current.current.filter((id) => id !== file.id));
    } else setError(result.error);
    setBusy(false);
  }

  function toggle(id: string, on: boolean) {
    tick(on ? [...current.current, id] : current.current.filter((entry) => entry !== id));
  }

  /** Any other answer changed: a failure about the files is history, as every failure is then. */
  function dismiss() {
    setError(null);
  }

  return { files, attached, busy, error, upload, remove, toggle, dismiss };
}

/**
 * The field: a place to add files, then every kept file with its tick (whether this request
 * carries it), Download and Remove.
 */
export function CoachFilesField({
  files,
  attached,
  busy,
  error,
  info = "They stay for later reviews until you remove them.",
  onUpload,
  onToggle,
  onRemove,
}: {
  files: CoachFile[];
  attached: string[];
  busy: boolean;
  /** Said under the place to add them, where the failure happened. */
  error?: string | null;
  info?: ReactNode;
  onUpload: (files: FileList | null) => void;
  onToggle: (id: string, on: boolean) => void;
  onRemove: (file: CoachFile) => void;
}) {
  return (
    <>
      <Field label="Reports and plans" info={info} error={error ?? undefined}>
        <FilePicker busy={busy} onUpload={onUpload} />
      </Field>
      {files.length > 0 && (
        <ul className="ruled-list">
          {files.map((file) => (
            <li key={file.id} className="space-y-2 py-2">
              <label
                htmlFor={`report-${file.id}`}
                className="flex min-h-[var(--ov-target)] cursor-pointer items-center gap-2 text-sm"
              >
                <input
                  type="checkbox"
                  id={`report-${file.id}`}
                  checked={attached.includes(file.id)}
                  className="size-5 shrink-0 accent-[var(--ov-accent)]"
                  disabled={
                    busy || (!attached.includes(file.id) && attached.length >= MAX_REQUEST_FILES)
                  }
                  onChange={(event) => onToggle(file.id, event.target.checked)}
                />
                <span className="min-w-0 flex-1 [overflow-wrap:break-word]">{file.name}</span>
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <a
                  className="inline-flex min-h-[var(--ov-target)] shrink-0 items-center text-sm text-accent underline"
                  href={`/api/coaching/attachments/${file.id}`}
                  aria-label={`Download ${file.name}`}
                  download
                >
                  Download
                </a>
                <Button
                  size="sm"
                  variant="ghost"
                  className="shrink-0"
                  aria-label={`Remove ${file.name}`}
                  disabled={busy}
                  onClick={() => onRemove(file)}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * A tap target rather than a native file button. The browser's own control renders as
 * "Choose Files / no files selected" pinned to the left of its box, which says nothing
 * about what may be attached and looks like nothing else on the screen.
 */
function FilePicker({
  busy,
  onUpload,
  id,
  "aria-describedby": describedBy,
  "aria-invalid": invalid,
}: {
  busy: boolean;
  onUpload: (files: FileList | null) => void;
  /** Field's, handed on to the input, so the field's label and error are the input's. */
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-control border border-dashed border-line-strong px-4 py-5 text-center transition-colors duration-[var(--ov-duration-feedback)] active:bg-surface-raised",
        busy && "pointer-events-none opacity-50",
      )}
    >
      <Paperclip className="text-ink-subtle" aria-hidden />
      <span className="text-sm font-medium">Add files</span>
      {/* What it takes, and the most it takes: said where the files are added. */}
      <span className="text-xs text-ink-subtle">
        PDF, image, CSV or text · 5 MB each, five files
      </span>
      <input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.txt,.md,.csv"
        multiple
        disabled={busy}
        className="sr-only"
        onChange={(event) => {
          onUpload(event.target.files);
          event.target.value = "";
        }}
      />
    </label>
  );
}
