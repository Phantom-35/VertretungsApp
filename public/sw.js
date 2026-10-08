// Bump VERSION to drop all old caches on the next deploy.
const VERSION = "v2";
const PAGE_CACHE = `kag-pages-${VERSION}`;
const STATIC_CACHE = `kag-static-${VERSION}`;
const NAVIGATION_TIMEOUT_MS = 6000;

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGE_CACHE, STATIC_CACHE]);
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)),
      );
      await self.clients.claim();
    })(),
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

// Pages: always try the network first so the app shows fresh data after a
// restart; fall back to the last cached page only when offline.
async function networkFirst(event) {
  const cache = await caches.open(PAGE_CACHE);
  const cacheKey = new URL(event.request.url).pathname;
  const networkResponse = fetch(event.request).then((response) => {
    if (response.ok) {
      return cache.put(cacheKey, response.clone()).then(() => response);
    }
    return response;
  });
  event.waitUntil(networkResponse.catch(() => undefined));

  try {
    return await Promise.race([networkResponse, timeout(NAVIGATION_TIMEOUT_MS)]);
  } catch {
    const cached = (await cache.match(cacheKey)) ?? (await cache.match("/"));
    return cached ?? networkResponse;
  }
}

// Hashed build assets never change: serve them from the cache.
async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
  }
  return response;
}

// Icons, manifest etc.: answer quickly, update in the background.
async function staleWhileRevalidate(event) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(event.request);
  const networkResponse = fetch(event.request)
    .then(async (response) => {
      if (response.ok) {
        await cache.put(event.request, response.clone());
      }
      return response;
    })
    .catch(() => cached);
  event.waitUntil(networkResponse.then(() => undefined));

  return cached ?? networkResponse;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // API data is never cached here; the app keeps its own offline copy.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(event));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
  } else if (!url.pathname.startsWith("/_next/")) {
    event.respondWith(staleWhileRevalidate(event));
  }
});
