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

// Build assets referenced by a text file, e.g. "static/chunks/abc.js" from
// script tags, the inlined page data or url(...) in a stylesheet.
async function collectAssetPaths(response, paths) {
  const text = await response.text();
  for (const match of text.matchAll(/static\/[^"'\s\\()<>,;]+/g)) {
    try {
      paths.add(decodeURIComponent(match[0].split(/[?#]/)[0]));
    } catch {
      paths.add(match[0]);
    }
  }
}

function assetPath(url) {
  const { pathname } = new URL(url);
  try {
    return decodeURIComponent(pathname.slice("/_next/".length));
  } catch {
    return pathname.slice("/_next/".length);
  }
}

// Every deploy brings new hashed build assets. Drop the ones no cached page
// needs any more, so the app's storage does not grow with each deploy. Kept:
// everything the cached pages and their stylesheets reference. Anything
// removed by mistake is simply loaded again from the network.
async function pruneStaticCache() {
  const [pageCache, staticCache] = await Promise.all([
    caches.open(PAGE_CACHE),
    caches.open(STATIC_CACHE),
  ]);
  const pages = await pageCache.keys();
  if (pages.length === 0) {
    return;
  }

  const used = new Set();
  for (const page of pages) {
    const response = await pageCache.match(page);
    if (response) {
      await collectAssetPaths(response, used);
    }
  }

  const assets = (await staticCache.keys()).filter((request) =>
    new URL(request.url).pathname.startsWith("/_next/static/"),
  );
  for (const request of assets) {
    const path = assetPath(request.url);
    if (used.has(path) && path.endsWith(".css")) {
      const response = await staticCache.match(request);
      if (response) {
        await collectAssetPaths(response, used);
      }
    }
  }

  await Promise.all(
    assets
      .filter((request) => !used.has(assetPath(request.url)))
      .map((request) => staticCache.delete(request)),
  );
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
  event.waitUntil(
    networkResponse
      .then((response) => (response.ok ? pruneStaticCache() : undefined))
      .catch(() => undefined),
  );

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
