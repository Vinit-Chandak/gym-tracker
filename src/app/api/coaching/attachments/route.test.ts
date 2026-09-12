import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { saved } = vi.hoisted(() => ({ saved: vi.fn() }));
vi.mock("@/server/auth", () => ({ requireProfiledUser: () => Promise.resolve({ id: "user-1" }) }));
vi.mock("@/db/client", () => ({ getDb: () => ({}) }));
vi.mock("@/db/with-user", () => ({
  withUser: (_db: unknown, _id: string, run: (tx: unknown) => unknown) => run({}),
}));
vi.mock("@/server/repositories/coach-attachments", () => ({
  MAX_COACH_FILE_BYTES: 3 * 1024 * 1024,
  saveCoachAttachment: (...args: unknown[]) => saved(...args),
}));

beforeEach(() => saved.mockReset().mockResolvedValue({ id: "file-1", name: "report.txt" }));
afterEach(() => vi.resetModules());

/**
 * The athlete's browser asks for whatever host they typed; the server's own `request.url`
 * says `localhost` regardless. Measuring the origin against that refused every upload made
 * from a custom domain or through a proxy — which is every real one.
 */
async function upload(headers: Record<string, string>) {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost:3000/api/coaching/attachments", {
      method: "POST",
      headers: { "content-type": "text/plain", "x-file-name": "report.txt", ...headers },
      body: "Blood work summary",
    }),
  );
}

it("takes an upload from the host the browser actually asked for", async () => {
  const response = await upload({
    origin: "https://overload.example",
    host: "overload.example",
  });
  expect(response.status).toBe(201);
  expect(saved).toHaveBeenCalled();
});

it("takes one from behind a proxy, which names the public host separately", async () => {
  const response = await upload({
    origin: "https://overload.example",
    host: "internal-7.fly.dev",
    "x-forwarded-host": "overload.example",
  });
  expect(response.status).toBe(201);
});

it("refuses one posted from somewhere else with the athlete's cookie", async () => {
  const response = await upload({ origin: "https://not-overload.example", host: "overload.example" });
  expect(response.status).toBe(403);
  expect(await response.json()).toEqual({ error: "Upload from this app's programme screen." });
  expect(saved).not.toHaveBeenCalled();
});

it("refuses one with no origin at all", async () => {
  expect((await upload({ host: "overload.example" })).status).toBe(403);
  expect(saved).not.toHaveBeenCalled();
});
