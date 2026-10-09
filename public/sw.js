/*
 * Private pages, API responses and actions always use the network — nothing about a
 * workout is ever stored in the cache. Only two public, non-personal things are cached:
 * the offline guidance, and the build's own immutable assets.
 *
 * The browser stops an idle worker after about thirty seconds, and starting it again costs
 * tens to hundreds of milliseconds on a phone. Two things keep that start off a tap's path
 * (ADR 0049): opening the app asks the network for the page while the worker starts
 * (navigation preload), and requests the worker would only pass on (screens fetched by the
 * router, prefetches, saving a set) go straight to the network without starting it at all,
 * where the browser supports declaring that (Chrome's static routing).
 */
const OFFLINE = "overload-offline-v5";
const ASSETS = "overload-assets-v3";
const KEEP = [OFFLINE, ASSETS];

/**
 * What the worker answers itself — pages, for the offline screen, and the cached assets and
 * icons. Everything else is declared network-only. The first matching rule wins.
 */
function routeAroundWorker(event) {
  if (typeof event.addRoutes !== "function" || typeof URLPattern !== "function") return;
  const path = (pathname) => ({ urlPattern: new URLPattern({ pathname }) });
  try {
    // A rule this browser does not understand must not stop the worker installing.
    return Promise.resolve(
      event.addRoutes([
        { condition: { requestMode: "navigate" }, source: "fetch-event" },
        { condition: path("/_next/static/*"), source: "fetch-event" },
        { condition: path("/icons/*"), source: "fetch-event" },
        { condition: path("/*"), source: "network" },
      ]),
    ).catch(() => {});
  } catch {
    return undefined;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(OFFLINE).then((cache) => cache.addAll(["/offline.html", "/icons/icon-192.png"])),
      routeAroundWorker(event),
    ]),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.registration.navigationPreload?.enable().catch(() => {}),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((key) => key.startsWith("overload-") && !KEEP.includes(key))
              .map((key) => caches.delete(key)),
          ),
        ),
    ]).then(() => self.clients.claim()),
  );
});

/** Build output is content-hashed, so a hit is always the right file and never stale. */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/");
}

/** The page the browser has already been asked for, or a new request where preload is off. */
async function openPage(event) {
  try {
    return (await event.preloadResponse) ?? (await fetch(event.request));
  } catch {
    return (await caches.match("/offline.html")) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(openPage(event));
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Icon URLs are stable between releases: refresh online so an old logo is not pinned
  // forever by cache-first. The public icon remains available without a connection.
  if (url.pathname.startsWith("/icons/")) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(ASSETS).then((cache) => cache.put(request, copy)));
          }
          return response;
        })
        .catch(() => caches.match(request)),
    );
    return;
  }
  if (!isImmutableAsset(url)) return;

  // Cache-first: on a phone this is the difference between a cold start and an instant one.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            event.waitUntil(caches.open(ASSETS).then((cache) => cache.put(request, copy)));
          }
          return response;
        }),
    ),
  );
});
