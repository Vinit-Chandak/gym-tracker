// The browser engines the audits launch, launched one way everywhere.
//
// Chromium honours AUDIT_CHROMIUM_PATH, for a machine whose browsers predate this Playwright.
// WebKit drives every iPhone device. A machine without it sets AUDIT_WEBKIT=0: those devices
// are then left out and reported as SKIPPED, never as passed. With WebKit asked for (the
// default) and not installed, the audit stops at once and says so, rather than taking the
// Chromium devices down with a launch error part-way through.
import { appendFileSync, existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { chromium, webkit } from "@playwright/test";

/** False when AUDIT_WEBKIT is 0, false, no or off. */
export const webkitEnabled = !/^(?:0|false|no|off)$/i.test(process.env.AUDIT_WEBKIT ?? "");

export const SKIP_REASON = "AUDIT_WEBKIT=0: WebKit devices are not run on this machine";

/** "webkit" or "chromium", from a Playwright browser type or an engine's name. */
export const engineName = (engine) =>
  engine === webkit || engine === "webkit" ? "webkit" : "chromium";

/** Throws, naming the missing executable and the switch, when WebKit is wanted and absent. */
export function assertWebkitInstalled() {
  const path = webkit.executablePath();
  if (!existsSync(path))
    throw new Error(
      `WebKit was requested but is not installed: ${path} does not exist. ` +
        "Install this Playwright's WebKit, or set AUDIT_WEBKIT=0 to skip the WebKit (iPhone) " +
        "devices; they are then reported as SKIPPED.",
    );
}

/** Launches the engine; refuses WebKit when it is switched off or missing. */
export async function launch(engine, options = {}) {
  if (engineName(engine) === "webkit") {
    if (!webkitEnabled)
      throw new Error("WebKit is switched off (AUDIT_WEBKIT=0); skip this device instead.");
    assertWebkitInstalled();
    return webkit.launch(options);
  }
  return chromium.launch({
    ...options,
    executablePath: process.env.AUDIT_CHROMIUM_PATH || undefined,
  });
}

/** Every device this process left out, as written into its results. */
export const skippedDevices = [];

/**
 * True when `device` runs on WebKit and WebKit is switched off. The device is then recorded as
 * SKIPPED: printed, kept in `skippedDevices` and, under the suite, appended to AUDIT_SKIP_LOG so
 * the suite's summary says so too.
 */
export function skipDevice(device, engine) {
  if (engineName(engine) !== "webkit" || webkitEnabled) return false;
  const row = { device, engine: "webkit", status: "SKIPPED", reason: SKIP_REASON };
  skippedDevices.push(row);
  console.log(`SKIPPED ${device} (webkit): ${SKIP_REASON}`);
  if (process.env.AUDIT_SKIP_LOG)
    appendFileSync(process.env.AUDIT_SKIP_LOG, `${JSON.stringify(row)}\n`);
  return true;
}

/**
 * For an audit of a single device: when that device is skipped, writes `file` to say so (SKIPPED,
 * not passed) and ends the process before it launches or writes anything else.
 */
export async function skipWholeRun(device, engine, file) {
  if (!skipDevice(device, engine)) return;
  await mkdir(dirname(file), { recursive: true });
  await writeFile(
    file,
    JSON.stringify({ status: "SKIPPED", passed: false, skipped: skippedDevices }, null, 2),
  );
  process.exit(0);
}
