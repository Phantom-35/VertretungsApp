// Bump VERSION to drop all old caches on the next deploy.
const VERSION = "v3";
const PAGE_CACHE = `kag-pages-${VERSION}`;
const STATIC_CACHE = `kag-static-${VERSION}`;
const NAVIGATION_TIMEOUT_MS = 6000;
// The number on the app icon, kept in the cache storage because the worker
// forgets its variables when it stops; the app deletes it when opened.
const BADGE_CACHE = "kag-badge";
const BADGE_KEY = "/__badge";

// The start page and its files are cached right away: the worker starts
// after the first page has loaded, so that page never passed through it, and
// the next start may already be offline.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const response = await fetch("/");
        if (response.ok && !response.redirected) {
          const cache = await caches.open(PAGE_CACHE);
          await cache.put("/", response.clone());
          await precacheAssets(response);
        }
      } catch {
        // Offline: cached on the next visit instead.
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([PAGE_CACHE, STATIC_CACHE, BADGE_CACHE]);
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

// Downloads the build files a freshly cached page needs (and what those
// files load in turn), so that it also works offline the next time it is
// served from the cache without having run before.
async function precacheAssets(page) {
  const staticCache = await caches.open(STATIC_CACHE);
  const seen = new Set();
  let pending = new Set();
  await collectAssetPaths(page, pending);
  while (pending.size > 0) {
    const next = new Set();
    for (const path of pending) {
      if (seen.has(path)) {
        continue;
      }
      seen.add(path);
      const request = new Request(`/_next/${path}`);
      let response = await staticCache.match(request);
      if (!response) {
        response = await fetch(request).catch(() => undefined);
        if (!response?.ok) {
          continue;
        }
        await staticCache.put(request, response.clone());
      }
      if (/\.(js|css)$/.test(path)) {
        await collectAssetPaths(response.clone(), next);
      }
    }
    pending = next;
  }
}

// Pages: the app opens at once with the page cached last time (its data is
// replaced by the device's newer copy and refreshed right away); the newest
// page is fetched in the background for the next start. Without a cached
// page, the network is tried first.
async function cachedPageFirst(event) {
  const cache = await caches.open(PAGE_CACHE);
  const cacheKey = new URL(event.request.url).pathname;
  const cached = await cache.match(cacheKey);
  if (!cached) {
    return networkFirst(event);
  }
  // Its body is read by the browser; the update needs its own copy.
  pageRefresh = refreshPage(cacheKey, cached.clone()).catch(() => undefined);
  event.waitUntil(pageRefresh);
  return cached;
}

// Fetches the newest version of a cached page (without "?day=…": a page
// rendered for a notification's day must not become the page every later
// start opens with) and caches it with its files. A new deploy (other build
// files) is announced to the open app, which then reloads at a moment that
// does not disturb (see PwaRegistrar).
async function refreshPage(cacheKey, previous) {
  const response = await fetch(cacheKey);
  if (!response.ok || response.redirected) {
    return;
  }
  const cache = await caches.open(PAGE_CACHE);
  const [oldBuild, newBuild] = await Promise.all([buildOf(previous.clone()), buildOf(response.clone())]);
  await cache.put(cacheKey, response.clone());
  await precacheAssets(response);
  await pruneStaticCache(previous);

  if (newBuild && newBuild !== oldBuild) {
    const windows = await self.clients.matchAll({ type: "window" });
    windows.forEach((client) => client.postMessage({ type: "app-updated" }));
  }
}

/** The deploy a page belongs to: `<meta name="kag-build" content="…">`. */
async function buildOf(page) {
  const text = await page.text();
  const tag = text.match(/<meta[^>]*name="kag-build"[^>]*>/)?.[0] ?? "";
  return tag.match(/content="([^"]*)"/)?.[1] ?? null;
}

// The background update started by the last page load, if any.
let pageRefresh = null;

// The app asks when it has started (the update may have finished before it
// listened) and when it comes back to the foreground (no page is loaded then,
// so nothing else would notice a new deploy). It sends the deploy its page
// belongs to; a cached page of another deploy is a newer version.
self.addEventListener("message", (event) => {
  if (event.data?.type !== "check-update" || typeof event.data.build !== "string") {
    return;
  }
  event.waitUntil(
    (async () => {
      const cache = await caches.open(PAGE_CACHE);
      if (event.data.fetch) {
        const cached = await cache.match("/");
        if (cached) {
          await refreshPage("/", cached);
        }
      } else {
        await pageRefresh;
      }
      const latest = await cache.match("/");
      const build = latest ? await buildOf(latest) : null;
      if (build && build !== event.data.build) {
        event.source?.postMessage({ type: "app-updated" });
      }
    })().catch(() => undefined),
  );
});

// Pages without a cached copy: try the network first, fall back to the
// start page when offline.
async function networkFirst(event) {
  const cache = await caches.open(PAGE_CACHE);
  const cacheKey = new URL(event.request.url).pathname;
  // The page cached so far, read before the new one replaces it.
  const previousPage = cache.match(cacheKey).catch(() => undefined);
  // Only pages without "?day=…" are cached (see cachedPageFirst).
  const cacheable = new URL(event.request.url).search === "";
  const networkResponse = fetch(event.request).then(async (response) => {
    if (response.ok && cacheable) {
      await previousPage;
      await cache.put(cacheKey, response.clone());
    }
    return response;
  });
  event.waitUntil(
    networkResponse
      .then(async (response) => {
        if (!response.ok || !cacheable) {
          return;
        }
        // From the cached copy: the response itself is read by the browser.
        const stored = await cache.match(cacheKey);
        if (stored) {
          await precacheAssets(stored);
        }
        await pruneStaticCache(await previousPage);
      })
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

  // API data is never cached here; the app keeps its own offline copy. The
  // same goes for the page data of Next.js client navigations ("?_rsc="),
  // which must be current.
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.searchParams.has("_rsc") ||
    request.headers.has("RSC")
  ) {
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(cachedPageFirst(event));
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

  // iOS adds the app name ("from Vertretungsplan") itself: no name here.
  const title = data.title || "Neue Änderungen";
  const options = {
    body: data.body || "Der Plan hat sich geändert.",
    icon: "/icon/192",
    lang: "de",
    data: { url: data.url || "/" },
  };
  if (data.tag) {
    options.tag = data.tag;
  }

  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, options),
      typeof data.badgeCount === "number"
        ? updateBadge(data.badgeCount, data.badgeMode === "set").catch(() => undefined)
        : undefined,
    ]),
  );
});

// The number on the app icon: changes not seen yet. Updates run one after
// another, so two pushes arriving together do not overwrite each other.
let badgeQueue = Promise.resolve();
function updateBadge(count, replace) {
  badgeQueue = badgeQueue.then(() => writeBadge(count, replace)).catch(() => undefined);
  return badgeQueue;
}

async function writeBadge(count, replace) {
  if (!self.navigator.setAppBadge) {
    return;
  }
  // Nothing to count while the app is open in front of the user.
  const windows = await self.clients.matchAll({ type: "window" });
  if (windows.some((client) => client.visibilityState === "visible")) {
    return;
  }
  const cache = await caches.open(BADGE_CACHE);
  const stored = await cache.match(BADGE_KEY);
  const current = stored ? Number(await stored.text()) || 0 : 0;
  // Changes add up; a summary shows at least the changes of its day.
  const total = replace ? Math.max(current, count) : current + count;
  await cache.put(BADGE_KEY, new Response(String(total)));
  await self.navigator.setAppBadge(total);
}

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
