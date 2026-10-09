import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

/**
 * The service worker (`public/sw.js`) run as written, against a stand-in for the worker's
 * global scope: its event handlers are captured and called the way the browser calls them.
 */
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

type Handler = (event: Record<string, unknown>) => void;

function loadWorker(options: { addRoutes?: unknown; navigationPreload?: boolean } = {}) {
  const handlers = new Map<string, Handler>();
  const offlinePage = new Response("offline");
  const cache = { addAll: vi.fn(async () => {}), put: vi.fn(async () => {}) };
  const enable = vi.fn(async () => {});
  const fetch = vi.fn(async () => new Response("network"));
  const self = {
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn(async () => {}) },
    registration: options.navigationPreload === false ? {} : { navigationPreload: { enable } },
    location: { origin: "https://overload.example" },
  };
  runInNewContext(source, {
    self,
    caches: {
      open: vi.fn(async () => cache),
      keys: vi.fn(async () => ["overload-offline-v5", "overload-assets-v1"]),
      delete: vi.fn(async () => true),
      match: vi.fn(async (request: unknown) =>
        request === "/offline.html" ? offlinePage : undefined,
      ),
    },
    fetch,
    URL,
    URLPattern: class {
      constructor(readonly init: { pathname: string }) {}
    },
    Response,
    Promise,
  });

  /** Fires an extendable event and waits for everything it was asked to wait for. */
  async function fire(type: string, fields: Record<string, unknown> = {}) {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    const event = {
      ...fields,
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      respondWith: (response: Promise<Response>) => (responded = Promise.resolve(response)),
    };
    handlers.get(type)!(event);
    await Promise.all(waits);
    return { responded: responded && (await responded) };
  }

  return { fire, fetch, enable, offlinePage };
}

const navigation = (fields: Record<string, unknown> = {}) => ({
  request: { method: "GET", mode: "navigate", url: "https://overload.example/today" },
  ...fields,
});

type Rule = {
  condition: { requestMode?: string; urlPattern?: { init: { pathname: string } } };
  source: string;
};

describe("installing", () => {
  it("sends what the worker would only pass on straight to the network", async () => {
    const addRoutes = vi.fn(async (_rules: Rule[]) => {});
    const worker = loadWorker();
    await worker.fire("install", { addRoutes });
    const rules = addRoutes.mock.calls[0]![0];
    expect(rules.map((rule) => rule.source)).toEqual([
      "fetch-event",
      "fetch-event",
      "fetch-event",
      "network",
    ]);
    expect(rules[0]!.condition.requestMode).toBe("navigate");
    expect(rules.slice(1).map((rule) => rule.condition.urlPattern!.init.pathname)).toEqual([
      "/_next/static/*",
      "/icons/*",
      "/*",
    ]);
  });

  it.each([
    ["has no static routing", undefined],
    ["rejects the rules", vi.fn(async () => Promise.reject(new TypeError("unknown condition")))],
    [
      "throws on the rules",
      vi.fn(() => {
        throw new TypeError("unknown condition");
      }),
    ],
  ])("still installs where the browser %s", async (_, addRoutes) => {
    const worker = loadWorker();
    await expect(worker.fire("install", { addRoutes })).resolves.toBeDefined();
  });
});

describe("activating", () => {
  it("turns on navigation preload", async () => {
    const worker = loadWorker();
    await worker.fire("activate");
    expect(worker.enable).toHaveBeenCalledOnce();
  });

  it("activates where the browser has no navigation preload", async () => {
    const worker = loadWorker({ navigationPreload: false });
    await expect(worker.fire("activate")).resolves.toBeDefined();
  });
});

describe("opening a page", () => {
  it("answers with the response the browser preloaded, without asking again", async () => {
    const worker = loadWorker();
    const preloaded = new Response("preloaded");
    const { responded } = await worker.fire("fetch", navigation({ preloadResponse: preloaded }));
    expect(responded).toBe(preloaded);
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it("fetches the page itself when nothing was preloaded", async () => {
    const worker = loadWorker();
    const { responded } = await worker.fire(
      "fetch",
      navigation({ preloadResponse: Promise.resolve(undefined) }),
    );
    expect(await responded!.text()).toBe("network");
    expect(worker.fetch).toHaveBeenCalledOnce();
  });

  it("shows the offline screen when the preloaded request fails", async () => {
    const worker = loadWorker();
    const { responded } = await worker.fire(
      "fetch",
      navigation({ preloadResponse: Promise.reject(new TypeError("Failed to fetch")) }),
    );
    expect(responded).toBe(worker.offlinePage);
  });

  it("leaves a server action to the network", async () => {
    const worker = loadWorker();
    const { responded } = await worker.fire("fetch", {
      request: { method: "POST", mode: "cors", url: "https://overload.example/workouts/s1" },
    });
    expect(responded).toBeUndefined();
  });
});
