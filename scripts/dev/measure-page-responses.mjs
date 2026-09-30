// Read-only page probes against the isolated local production build. These measure full HTML
// response time, not browser navigation, hydration, or paint. Never use a live account here.
// Start `audit:auth` and `audit:start` with the same AUDIT_DATABASE_URL before running this.
import { createServerClient } from "@supabase/ssr";
import { writeFile } from "node:fs/promises";

const baseURL = new URL(process.env.AUDIT_BASE_URL ?? "http://127.0.0.1:3100");
const authURL = new URL(process.env.AUDIT_AUTH_URL ?? "http://127.0.0.1:54321");
for (const url of [baseURL, authURL]) {
  if (
    !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
    url.protocol !== "http:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw new Error("Only loopback audit servers are supported.");
}
const runs = Number(process.env.PAGE_RESPONSE_RUNS ?? 3);
if (!Number.isInteger(runs) || runs < 1 || runs > 10) throw new Error("Use 1–10 samples.");
const jar = new Map();
const auth = createServerClient(authURL.origin, "dev-anon-key", {
  cookies: {
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    setAll: (cookies) => cookies.forEach(({ name, value }) => jar.set(name, value)),
  },
});
const { error } = await auth.auth.signInWithPassword({
  email: "vinit@local.test",
  password: "password123",
});
if (error) throw new Error(`Local audit sign-in failed: ${error.message}`);
const cookie = [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
const paths = [
  "/today",
  "/training",
  "/food",
  "/progress",
  "/profile",
  "/progress/history",
  "/profile/programme",
  "/profile/programme?view=changes",
  "/food/my-foods/meals/new",
  "/exercises",
  "/gyms",
  "/profile/friends",
  "/profile/friends/people",
  "/profile/friends/leaderboard",
];
async function probe(path) {
  const started = performance.now();
  const response = await fetch(new URL(path, baseURL), {
    headers: { cookie },
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const headersMs = performance.now() - started;
  const body = await response.text();
  const totalMs = performance.now() - started;
  // App Router can stream a failure after the HTTP status has already been sent.
  if (
    response.status !== 200 ||
    /NEXT_REDIRECT|NEXT_HTTP_ERROR_FALLBACK|Something went wrong|Something stopped this page/.test(
      body,
    )
  )
    throw new Error(`Page probe failed: ${path} (HTTP ${response.status}).`);
  return {
    headersMs: Math.round(headersMs),
    totalMs: Math.round(totalMs),
    bytes: Buffer.byteLength(body),
  };
}
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const rows = [];
for (const path of paths) {
  await probe(path); // Warm-up is explicit and excluded, so this is never a cold-start claim.
  const samples = [];
  for (let sample = 0; sample < runs; sample++) samples.push(await probe(path));
  rows.push({
    path,
    samples: runs,
    headersMs: median(samples.map((sample) => sample.headersMs)),
    totalMs: median(samples.map((sample) => sample.totalMs)),
    bytes: median(samples.map((sample) => sample.bytes)),
  });
}
console.table(rows);
if (process.env.PAGE_RESPONSE_OUT)
  await writeFile(
    process.env.PAGE_RESPONSE_OUT,
    JSON.stringify({ kind: "warm local HTML responses; not browser latency", rows }, null, 2),
  );
