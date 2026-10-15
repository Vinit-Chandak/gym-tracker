import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

/**
 * The service worker (`public/sw.js`) run as written, against a stand-in for the worker's
 * global scope: its event handlers are captured and called the way the browser calls them.
 */
const source = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

type Handler = (event: Record<string, unknown>) => void;

/** A cache that keeps its entries in the order they were stored, as the browser's does. */
function fakeCache(urls: string[]) {
  const entries = new Map<string, unknown>(urls.map((url) => [url, new Response("asset")]));
  return {
    entries,
    addAll: vi.fn(async () => {}),
    put: vi.fn(async (request: { url: string }, response: unknown) => {
      entries.delete(request.url);
      entries.set(request.url, response);
    }),
    keys: vi.fn(async () => [...entries.keys()].map((url) => ({ url }))),
    delete: vi.fn(async (request: { url: string }) => entries.delete(request.url)),
  };
}

function loadWorker(
  options: {
    addRoutes?: unknown;
    navigationPreload?: boolean;
    cacheNames?: string[];
    assets?: string[];
  } = {},
) {
  const handlers = new Map<string, Handler>();
  const offlinePage = new Response("offline");
  const cache = fakeCache(options.assets ?? []);
  const claim = vi.fn(async () => {});
  const deleteCache = vi.fn(async (_name: string) => true);
  const enable = vi.fn(async () => {});
  const fetch = vi.fn(async () => new Response("network"));
  const self = {
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
    skipWaiting: vi.fn(),
    clients: { claim },
    registration: options.navigationPreload === false ? {} : { navigationPreload: { enable } },
    location: { origin: "https://overload.example" },
  };
  runInNewContext(source, {
    self,
    caches: {
      open: vi.fn(async () => cache),
      keys: vi.fn(async () => options.cacheNames ?? ["overload-offline-v5", "overload-assets-v1"]),
      delete: deleteCache,
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
    const response = responded && (await responded);
    // An asset is put in the cache while its response is on its way, so wait for that too.
    await Promise.all(waits);
    return { responded: response };
  }

  return { fire, fetch, enable, offlinePage, cache, claim, deleteCache };
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

describe("keeping the asset cache bounded", () => {
  const asset = (name: string) => `https://overload.example/_next/static/chunks/${name}.js`;
  const assetRequest = (name: string) => ({
    request: { method: "GET", mode: "no-cors", url: asset(name) },
  });

  it("lets the oldest assets go once it holds more than two releases' worth", async () => {
    const icon = "https://overload.example/icons/icon-192.png";
    const older = Array.from({ length: 250 }, (_, index) => asset(`old-${index}`));
    const worker = loadWorker({ assets: [icon, ...older] });
    const { responded } = await worker.fire("fetch", assetRequest("new"));
    expect(await responded!.text()).toBe("network");
    const kept = [...worker.cache.entries.keys()];
    expect(kept).toHaveLength(251);
    expect(kept).not.toContain(asset("old-0"));
    expect(kept).toContain(asset("old-1"));
    expect(kept.at(-1)).toBe(asset("new"));
    // Icons are refreshed in place rather than added release by release.
    expect(kept).toContain(icon);
  });

  it("keeps everything while there is room", async () => {
    const worker = loadWorker({ assets: [asset("a"), asset("b")] });
    await worker.fire("fetch", assetRequest("c"));
    expect([...worker.cache.entries.keys()]).toEqual([asset("a"), asset("b"), asset("c")]);
  });

  it("drops the earlier caches on activating, the one that kept every release among them", async () => {
    const worker = loadWorker({
      cacheNames: [
        "overload-offline-v5",
        "overload-assets-v3",
        "overload-offline-v6",
        "overload-assets-v4",
      ],
    });
    await worker.fire("activate");
    expect(worker.deleteCache.mock.calls.map(([name]) => name)).toEqual([
      "overload-offline-v5",
      "overload-assets-v3",
    ]);
  });

  it("trims what an earlier worker left, on activating", async () => {
    const worker = loadWorker({
      assets: Array.from({ length: 260 }, (_, index) => asset(`${index}`)),
    });
    await worker.fire("activate");
    expect(worker.cache.entries.size).toBe(250);
    expect(worker.cache.entries.has(asset("0"))).toBe(false);
  });

  it("activates even when the cache cannot be read", async () => {
    const worker = loadWorker();
    worker.cache.keys.mockRejectedValueOnce(new Error("The cache could not be opened"));
    await expect(worker.fire("activate")).resolves.toBeDefined();
    expect(worker.claim).toHaveBeenCalledOnce();
  });
});
