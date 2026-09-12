import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import { api, appUrl, args, fail } from "./client";

const a = args(),
  command = process.argv[2];
const required = (key: string) => a.get(key) ?? fail(`Pass --${key}.`);
const uuid = (key: string) => z.uuid().parse(required(key));
async function main() {
  let result: unknown;
  if (command === "contract") result = await api("workflow/contract");
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
      if (command === "context") result = await api(`${root}/context${query}`);
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
      } else fail("Use contract, dispatch, queue, claim, context, attachment, result or fail.");
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
