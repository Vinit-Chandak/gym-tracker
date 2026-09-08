/*
 * Private pages, API responses and actions always use the network — nothing about a
 * workout is ever stored in the cache. Only two public, non-personal things are cached:
 * the offline guidance, and the build's own immutable assets.
 */
const OFFLINE = "overload-offline-v1";
const ASSETS = "overload-assets-v1";
const KEEP = [OFFLINE, ASSETS];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(OFFLINE).then((cache) => cache.addAll(["/offline.html", "/icons/icon-192.png"])),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith("overload-") && !KEEP.includes(key))
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

/** Build output is content-hashed, so a hit is always the right file and never stale. */
function isImmutableAsset(url) {
  return url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !isImmutableAsset(url)) return;

  // Cache-first: on a phone this is the difference between a cold start and an instant one.
  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ??
        fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(ASSETS).then((cache) => cache.put(request, copy));
          }
          return response;
        }),
    ),
  );
});
