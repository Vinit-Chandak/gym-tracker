// How each main screen's server time grows with the app↔database round trip (ADR 0030).
//
// A proxy between the app and the audit database adds a fixed delay each way and counts the
// statements that pass through it. The script signs in as the seeded Vinit, captures the real
// request a tab switch makes for each screen, then replays each one at several round-trip
// times. The slope of time against round trip is the number of trips a screen waits for in
// sequence; statements and bytes show where they come from.
//
//   npm run audit:setup    # once
//   npm run audit:build    # after each change being measured
//   npm run audit:auth     # terminal 1
//   AUDIT_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:6543/overload_audit \
//     npm run audit:start  # terminal 2: the app, talking to the proxy
//   npm run audit:latency  # terminal 3
//
// LATENCY_RTTS=0,2,24 chooses the round trips (ms); LATENCY_RUNS=5 the samples per point.
import { chromium, devices } from "@playwright/test";
import net from "node:net";

const baseURL = process.env.AUDIT_BASE_URL ?? "http://localhost:3100";
const target = new URL(
  process.env.AUDIT_TARGET_DATABASE_URL ??
    "postgres://postgres:postgres@127.0.0.1:5432/overload_audit",
);
const proxyPort = Number(process.env.LATENCY_PROXY_PORT ?? 6543);
const rtts = (process.env.LATENCY_RTTS ?? "0,2,24").split(",").map(Number);
const runs = Number(process.env.LATENCY_RUNS ?? 5);
if (
  !["localhost", "127.0.0.1"].includes(new URL(baseURL).hostname) ||
  !["localhost", "127.0.0.1"].includes(target.hostname) ||
  !/^\/overload_audit(?:_[a-z0-9]+)*$/.test(target.pathname)
)
  throw new Error("Local audit only.");

// --- The proxy: delays each chunk by `delay` ms in each direction and counts messages. ---
let delay = 0;
let counted = { statements: 0, describes: 0 };
function pipe(from, to, onChunk) {
  let last = 0;
  from.on("data", (chunk) => {
    onChunk?.(chunk);
    const due = Math.max(Date.now() + delay, last);
    last = due;
    const wait = due - Date.now();
    if (wait <= 0) to.write(chunk);
    else setTimeout(() => to.write(chunk), wait);
  });
  from.on("end", () => setTimeout(() => to.end(), delay));
  from.on("error", () => to.destroy());
}
const proxy = net.createServer((client) => {
  const server = net.connect(Number(target.port || 5432), target.hostname);
  let started = false;
  let buffer = Buffer.alloc(0);
  // Client messages after the startup packet are a type byte and a length: E(xecute) and
  // Q(uery) are statements run, D(escribe) the extra exchange before a parameterised one.
  pipe(client, server, (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      if (!started) {
        if (buffer.length < 4 || buffer.length < buffer.readUInt32BE(0)) break;
        buffer = buffer.subarray(buffer.readUInt32BE(0));
        started = true;
        continue;
      }
      if (buffer.length < 5 || buffer.length < 1 + buffer.readUInt32BE(1)) break;
      const type = String.fromCharCode(buffer[0]);
      if (type === "E" || type === "Q") counted.statements++;
      if (type === "D") counted.describes++;
      buffer = buffer.subarray(1 + buffer.readUInt32BE(1));
    }
  });
  pipe(server, client);
  client.on("error", () => server.destroy());
  server.on("error", () => client.destroy());
});
await new Promise((resolve) => proxy.listen(proxyPort, "127.0.0.1", resolve));

// --- Capture the request each tab switch really makes. ---
const browser = await chromium.launch();
const context = await browser.newContext({ ...devices["Pixel 7"], baseURL });
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const captured = new Map();
let wanted = null;
page.on("request", async (request) => {
  const headers = request.headers();
  if (!wanted || headers.rsc !== "1" || headers["next-router-prefetch"]) return;
  if (new URL(request.url()).pathname === wanted)
    captured.set(wanted, { url: request.url(), headers: await request.allHeaders() });
});
const settled = (path) =>
  page.waitForFunction(
    (p) => location.pathname === p && !/Loading\b/.test(document.body.innerText),
    path,
  );
await page.goto("/login");
await page.getByLabel("Email", { exact: true }).fill("vinit@local.test");
await page.getByLabel("Password", { exact: true }).fill("password123");
await page.getByRole("button", { name: "Sign in", exact: true }).click();
await page.waitForURL((url) => url.pathname === "/today");
await settled("/today");
const nav = (label) =>
  page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: label, exact: true });
/** History is a section of Progress (ADR 0034), opened from its picker. */
async function openHistory() {
  await nav("Progress").click();
  await settled("/progress");
  await page.getByRole("button", { name: "Progress section: Overview" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "History", exact: true }).click();
  await settled("/progress/history");
}
for (const [path, label] of [
  ["/training", "Training"],
  ["/food", "Food"],
  ["/progress", "Progress"],
  ["/profile", "Profile"],
]) {
  wanted = path;
  await nav(label).click();
  await settled(path);
}
wanted = "/progress/history";
await openHistory();
// Signing in landed on Today, and the browser keeps a tab's screen for a minute, so a click on
// it now would ask the server for nothing. A page loaded afresh starts with no screens kept.
await page.goto("/training");
await settled("/training");
wanted = "/today";
await nav("Today").click();
await settled("/today");
wanted = null;
await openHistory();
const workout = page.locator('a[href^="/workouts/"]').first();
wanted = new URL(await workout.evaluate((a) => a.href)).pathname;
await workout.click();
await settled(wanted);
await browser.close();

// --- Replay each request at each round trip. ---
async function replay({ url, headers }) {
  const sent = { ...headers };
  delete sent.host;
  const started = performance.now();
  const response = await fetch(url, { headers: sent, redirect: "manual" });
  const bytes = (await response.arrayBuffer()).byteLength;
  return { ms: performance.now() - started, bytes, status: response.status };
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rows = [];
for (const rtt of rtts) {
  delay = rtt / 2;
  for (const [path, request] of captured) {
    await replay(request);
    const samples = [];
    for (let i = 0; i < runs; i++) {
      counted = { statements: 0, describes: 0 };
      const result = await replay(request);
      await new Promise((resolve) => setTimeout(resolve, 50));
      samples.push({ ...result, ...counted });
    }
    rows.push({
      "rtt ms": rtt,
      screen: path.startsWith("/workouts/") ? "/workouts/[id]" : path,
      status: samples[0].status,
      "server ms": Math.round(median(samples.map((s) => s.ms))),
      kB: +(median(samples.map((s) => s.bytes)) / 1024).toFixed(1),
      statements: median(samples.map((s) => s.statements)),
      describes: median(samples.map((s) => s.describes)),
    });
  }
}
console.table(rows);
proxy.close();
process.exit(0);
