// Bumped whenever the caching *rules* change, not only when assets do: the
// activate handler deletes every cache that is not this name, and that is the
// only way to evict entries a previous version should never have stored. v3
// cached page and RSC responses — see the allowlist below — so those have to go
// from browsers that already have them.
const CACHE_NAME = "intellibase-v4";

// The only things worth caching, and more to the point the only things it is
// safe to cache. Everything else reaches the network untouched.
//
// v3 worked the other way round: it cached anything same-origin that was not
// `/api/` and not a navigation. That denylist has a hole. A Next.js App Router
// prefetch of a page is an ordinary fetch() for an RSC payload — its mode is
// not "navigate" and its path is not /api/ — so a request for "/" fell
// straight through into the asset cache. Two consequences, and the second is
// the console line this fixes:
//
//   1. A page's RSC payload got stored and served back stale after a deploy,
//      which is the exact failure the navigation guard exists to prevent,
//      arriving through a different door.
//   2. When one of those fetches failed or was aborted, the handler answered
//      Response.error(), and the browser reported it against the page URL:
//      "The FetchEvent for https://…/ resulted in a network error response".
//
// A destination allowlist closes both. `request.destination` is set by the
// browser from what the request is *for*, so no URL shape can disguise itself:
// scripts, stylesheets, images and fonts are cacheable; documents, RSC payloads
// (destination is the empty string), API calls and everything else are not.
const CACHEABLE_DESTINATIONS = new Set(["script", "style", "image", "font"]);

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

  // No CacheStorage, no worker. Some browsers withhold `caches` entirely in
  // private windows, and reading it below would throw inside the event handler
  // rather than anywhere it could be caught. Bowing out leaves every request to
  // the network, which is what this worker is trying to accelerate, not enable.
  if (!self.caches) return;

  // Kept even though the allowlist below already excludes documents: a
  // navigation is the one request where getting this wrong serves stale HTML to
  // someone who just deployed, and saying it twice costs nothing.
  if (request.mode === "navigate") return;

  if (!CACHEABLE_DESTINATIONS.has(request.destination)) return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

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
    caches
      .match(request)
      // A failure to *read* the cache must never fail the request. Storage can
      // reject for reasons that have nothing to do with this asset — quota,
      // eviction mid-read, a locked profile — and since this handler now covers
      // scripts, stylesheets and fonts, turning one of those into Response.error()
      // renders the page blank or unstyled while the network was fine all along.
      // Treat an unreadable cache as an empty one.
      .catch(() => undefined)
      .then((cached) => {
        if (cached) return cached;
        return fetch(request).then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return res;
        });
      })
      // Only a genuine network failure reaches here now.
      .catch(() => Response.error())
  );
});
