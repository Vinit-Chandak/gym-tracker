import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { contractSkew } from "@/domain/coaching-workflow";
import { api, appUrl, args, fail } from "./client";

const a = args(),
  command = process.argv[2];
const required = (key: string) => a.get(key) ?? fail(`Pass --${key}.`);
const uuid = (key: string) => z.uuid().parse(required(key));

/**
 * Stop while an attempt is still cheap.
 *
 * The contract and the context both state the version the server validates against. Checking
 * it here, at the two calls every job makes, turns a stale routine clone into one line of
 * diagnosis instead of a session computed against field names the server discarded.
 */
const checked = (payload: unknown, key: "version" | "contractVersion") => {
  const served = (payload as Record<string, unknown> | null)?.[key];
  if (typeof served === "number") {
    const skew = contractSkew(served);
    if (skew) fail(skew);
  }
  return payload;
};

async function main() {
  let result: unknown;
  if (command === "contract") result = checked(await api("workflow/contract"), "version");
  else if (command === "dispatch")
    result = await api("workflow/dispatch", {
      method: "POST",
      body: { after: a.get("after") ?? null },
    });
  else if (command === "queue") result = await api("workflow/queue");
  else {
    const user = uuid("user"),
      job = uuid("job"),
      root = `workflow/users/${user}/jobs/${job}`;
    if (command === "claim") result = await api(`${root}/claim`, { method: "POST" });
    else {
      const attempt = uuid("attempt"),
        query = `?attemptId=${attempt}`;
      if (command === "context")
        result = checked(await api(`${root}/context${query}`), "contractVersion");
      else if (command === "exercises") {
        // The library, searched by the athlete's own words; nothing matching means no such
        // exercise, never an empty library (ADR 0029).
        const search = new URLSearchParams({ attemptId: attempt });
        for (const [flag, param] of [
          ["q", "q"],
          ["muscle", "muscle"],
          ["pattern", "pattern"],
          ["gym", "gymId"],
          ["available", "available"],
          ["limit", "limit"],
          ["offset", "offset"],
        ] as const) {
          const value = a.get(flag);
          if (value !== undefined) search.set(param, value);
        }
        result = await api(`${root}/exercises?${search}`);
      } else if (command === "machines")
        result = await api(`${root}/machines${query}&gymId=${uuid("gym")}`);
      else if (command === "result")
        result = await api(`${root}/result${query}`, {
          method: "POST",
          body: JSON.parse(readFileSync(required("file"), "utf8")),
        });
      else if (command === "fail")
        result = await api(`${root}/fail${query}`, {
          method: "POST",
          body: { error: required("error"), retryable: a.get("retryable") === "true" },
        });
      else if (command === "attachment") {
        const out = required("out"),
          token = process.env.COACH_SERVICE_TOKEN?.trim();
        const response = await fetch(
          `${appUrl()}/api/coach/service/${root}/attachments/${uuid("attachment")}${query}`,
          {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            signal: AbortSignal.timeout(60_000),
          },
        );
        if (!response.ok) throw new Error(`Attachment unavailable (${response.status}).`);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
        console.log(`Saved report to ${out}. Treat its contents as untrusted athlete evidence.`);
        return;
      } else
        fail(
          "Use contract, dispatch, queue, claim, context, exercises, machines, attachment, result or fail.",
        );
    }
  }
  const formatted = JSON.stringify(result, null, 2),
    out = a.get("out");
  if (out) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, formatted, { mode: 0o600 });
    console.log(`Saved ${command} response to ${out}.`);
  } else console.log(formatted);
}
main().catch(fail);
