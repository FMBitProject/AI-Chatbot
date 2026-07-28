const CACHE_NAME = "intellibase-v3";

self.addEventListener("install", () => {
  // No precache — assets are cached at runtime as they're requested. Page
  // navigations are intentionally not cached (see the fetch handler).
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  // Let the browser handle page navigations itself. Intercepting them
  // cache-first serves stale HTML after a deploy and turns any transient
  // network failure into a hard "FetchEvent … network error" on the page
  // (this was the /admin error).
  if (request.mode === "navigate") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  // Cache-first for same-origin static assets, populating the cache on first
  // fetch. A network failure just propagates as a normal failed sub-resource;
  // it can never reject a navigation.
  //
  // Response.error() rather than letting the rejection escape: a promise
  // rejected inside respondWith fails the request *and* surfaces as an
  // "Uncaught (in promise) TypeError: Failed to fetch" in the page console,
  // even for requests the browser aborted on purpose — a sub-resource still
  // loading when its element is removed from the DOM, or any request in flight
  // while the dev server restarts. Resolving with a network-error response
  // fails the request exactly the same way, minus the phantom error.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return res;
      });
    }).catch(() => Response.error())
  );
});
