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

function safeDecode(path) {
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

// Build assets referenced by a text file, e.g. "static/chunks/abc.js" from
// script tags, the inlined page data, a chunk loading another chunk or
// url(...) in a stylesheet.
async function collectAssetPaths(response, paths) {
  const text = await response.text();
  for (const match of text.matchAll(/static\/[^"'\s\\()<>,;]+/g)) {
    paths.add(safeDecode(match[0].split(/[?#]/)[0]));
  }
}

/** "/_next/static/chunks/abc.js" -> "static/chunks/abc.js" */
function assetPath(url) {
  return safeDecode(new URL(url).pathname.slice("/_next/".length));
}

// Every deploy brings new hashed build assets. Drop the ones no cached page
// needs any more, so the app's storage does not grow with each deploy. Kept:
// everything the cached pages and `previousPage` reference, and whatever those
// files reference in turn. The previous page is kept too because it may still
// be on screen (served from the cache after a slow network answer) and load
// its files from the cache, possibly offline.
async function pruneStaticCache(previousPage) {
  const [pageCache, staticCache] = await Promise.all([
    caches.open(PAGE_CACHE),
    caches.open(STATIC_CACHE),
  ]);

  const used = new Set();
  if (previousPage) {
    await collectAssetPaths(previousPage, used);
  }
  for (const page of await pageCache.keys()) {
    const response = await pageCache.match(page);
    if (response) {
      await collectAssetPaths(response, used);
    }
  }

  const assets = new Map();
  for (const request of await staticCache.keys()) {
    if (new URL(request.url).pathname.startsWith("/_next/static/")) {
      assets.set(assetPath(request.url), request);
    }
  }

  // Follow references from used scripts and stylesheets to further files.
  const scanned = new Set();
  let pending = [...used];
  while (pending.length > 0) {
    const next = [];
    for (const path of pending) {
      const request = assets.get(path);
      if (scanned.has(path) || !request || !/\.(js|css)$/.test(path)) {
        continue;
      }
      scanned.add(path);
      const response = await staticCache.match(request);
      if (response) {
        const found = new Set();
        await collectAssetPaths(response, found);
        found.forEach((foundPath) => {
          if (!used.has(foundPath)) {
            used.add(foundPath);
            next.push(foundPath);
          }
        });
      }
    }
    pending = next;
  }

  await Promise.all(
    [...assets]
      .filter(([path]) => !used.has(path))
      .map(([, request]) => staticCache.delete(request)),
  );
}

// Pages: always try the network first so the app shows fresh data after a
// restart; fall back to the last cached page only when offline.
async function networkFirst(event) {
  const cache = await caches.open(PAGE_CACHE);
  const cacheKey = new URL(event.request.url).pathname;
  // The page cached so far, read before the new one replaces it.
  const previousPage = cache.match(cacheKey).catch(() => undefined);
  const networkResponse = fetch(event.request).then(async (response) => {
    if (response.ok) {
      await previousPage;
      await cache.put(cacheKey, response.clone());
    }
    return response;
  });
  event.waitUntil(
    networkResponse
      .then(async (response) =>
        response.ok ? pruneStaticCache(await previousPage) : undefined,
      )
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

// Push notifications. Every push must show a notification: iOS cancels the
// subscription of apps that receive pushes without showing one.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Vertretungsplan";
  const options = {
    body: data.body || "Der Vertretungsplan hat sich geändert.",
    icon: "/icon/192",
    lang: "de",
    data: { url: data.url || "/" },
  };
  if (data.tag) {
    options.tag = data.tag;
  }

  const badge =
    typeof data.badgeCount === "number" && self.navigator.setAppBadge
      ? self.navigator.setAppBadge(data.badgeCount).catch(() => undefined)
      : undefined;
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), badge]));
});

// Tapping a notification opens the app on the day concerned.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "/", self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (open) {
        await open.focus();
        open.postMessage({ type: "open-url", url });
        return;
      }
      await self.clients.openWindow(url);
    })(),
  );
});

// The browser renewed the push subscription: move the settings over.
self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      const old = event.oldSubscription;
      const renewed =
        event.newSubscription ||
        (old && (await self.registration.pushManager.subscribe(old.options)));
      if (!old || !renewed) {
        return;
      }
      await fetch("/api/push/resubscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ oldEndpoint: old.endpoint, subscription: renewed.toJSON() }),
      });
    })().catch(() => undefined),
  );
});
