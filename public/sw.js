/*
 * Engawa offline snapshot (N9). Plain service worker, no library.
 *
 * After a quake the mobile network is the first thing to go, so a reader who
 * opened a board once keeps a copy of what the public board already showed:
 * the board page, card pages, the about page and the board's latest poll,
 * network first with the cache as fallback; the build's static files and the
 * sample inputs, cache first. Nothing else is touched: no POST, no drop-in,
 * no processing stream, no questions, no admin, no masked images or traces.
 *
 * Every stored copy carries the time it was stored (STORED_AT). A copy served
 * from the cache carries FROM_CACHE, so the board's poll knows it is offline,
 * and a page can ask over postMessage whether its own HTML came from here.
 *
 * Bump VERSION by hand when these rules change: activate deletes every older
 * Engawa cache. skipWaiting and clients.claim let a deploy take over open
 * pages on their next load.
 *
 * The same worker shows web push alerts (day 7, lib/push/send.ts): a
 * notification per official or danger card, or for a board switching to
 * disaster mode, and a tap opens that card or board on this site.
 */
const VERSION = 2;
const PAGES = `engawa-pages-v${VERSION}`;
const STATIC = `engawa-static-v${VERSION}`;
const STORED_AT = "x-engawa-stored-at";
const FROM_CACHE = "x-engawa-from-cache";
/** Oldest entries go first beyond these counts, so a long week of deploys and card visits stays small. */
const MAX_PAGES = 60;
const MAX_STATIC = 200;
/** Registered as /sw.js?dev=1 by `next dev`, whose chunks are not content hashed: static files go network first there. */
const DEV = new URL(self.location.href).searchParams.has("dev");

/** Paths kept for offline reading, network first. Mirrored by OFFLINE_PAGE in lib/offline.ts for the banner. */
const NETWORK_FIRST = [
  /^\/b\/[^/]+\/?$/, // board page
  /^\/b\/[^/]+\/c\/[^/]+(?:\/notice)?\/?$/, // card page and its printable notice
  /^\/api\/b\/[^/]+\/cards\/?$/, // the board's 5 second poll
  /^\/about\/?$/,
];
/** Content hashed build files and the fixed sample inputs, cache first. */
const CACHE_FIRST = [/^\/_next\/static\//, /^\/samples\//];

/** Navigations answered from the cache, by URL, with the stored time: pages ask for theirs once mounted. */
const servedFromCache = new Map();

function cacheFor(url) {
  if (url.origin !== self.location.origin) return null;
  if (CACHE_FIRST.some((re) => re.test(url.pathname))) return STATIC;
  // Client side navigations fetch React payloads from the same paths: never stored.
  if (url.searchParams.has("_rsc")) return null;
  if (NETWORK_FIRST.some((re) => re.test(url.pathname))) return PAGES;
  return null;
}

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const current = new Set([PAGES, STATIC]);
      for (const name of await caches.keys()) {
        if (name.startsWith("engawa-") && !current.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.cache === "only-if-cached" && request.mode !== "same-origin") return;
  if (request.headers.has("RSC")) return;
  const name = cacheFor(new URL(request.url));
  if (!name) return;
  if (name === STATIC && !DEV) event.respondWith(cacheFirst(event));
  else event.respondWith(networkFirst(event, name));
});

async function networkFirst(event, name) {
  const { request } = event;
  let response;
  try {
    response = await fetch(request);
  } catch (error) {
    const cache = await caches.open(name);
    let cached = await cache.match(request, { ignoreVary: true });
    // The board under ?view=places is the same page, and the client reads the
    // view from the URL: an offline reload takes a stored copy under any query.
    if (!cached && request.mode === "navigate") cached = await cache.match(request, { ignoreVary: true, ignoreSearch: true });
    if (!cached) throw error;
    if (request.mode === "navigate") servedFromCache.set(request.url, cached.headers.get(STORED_AT) ?? "");
    return withHeader(cached, FROM_CACHE, "1");
  }
  if (request.mode === "navigate") servedFromCache.delete(request.url);
  if (name === PAGES && (response.status === 404 || response.status === 410)) {
    // A page that is gone (a card the admin hid) must not survive in the cache.
    event.waitUntil(caches.open(name).then((cache) => cache.delete(request, { ignoreVary: true })));
    servedFromCache.delete(request.url);
  }
  if (storable(response)) event.waitUntil(store(name, request, response.clone()));
  return response;
}

async function cacheFirst(event) {
  const { request } = event;
  const cached = await (await caches.open(STATIC)).match(request, { ignoreVary: true });
  if (cached) return cached;
  const response = await fetch(request);
  if (storable(response)) event.waitUntil(store(STATIC, request, response.clone()));
  return response;
}

function storable(response) {
  return response.ok && response.type === "basic" && !response.redirected;
}

async function store(name, request, response) {
  const headers = new Headers(response.headers);
  headers.set(STORED_AT, new Date().toISOString());
  // The body is stored decoded; Vary is dropped because only full pages are kept.
  for (const header of ["content-encoding", "content-length", "vary"]) headers.delete(header);
  const body = await response.blob();
  const cache = await caches.open(name);
  await cache.put(request, new Response(body, { status: response.status, statusText: response.statusText, headers }));
  const keys = await cache.keys();
  const excess = keys.length - (name === STATIC ? MAX_STATIC : MAX_PAGES);
  for (const key of keys.slice(0, Math.max(0, excess))) await cache.delete(key);
}

function withHeader(response, name, value) {
  const headers = new Headers(response.headers);
  headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

/**
 * The first page a reader opens loads before this worker exists, so nothing
 * of it went through here. Once active, that page sends its own URL and the
 * build files it loaded ("warm"); the same rules above decide what is kept.
 * "cache-status" answers whether a page's HTML came from the cache.
 */
self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || typeof data !== "object") return;
  if (data.type === "engawa:warm" && Array.isArray(data.urls)) {
    event.waitUntil(warm(data.urls.slice(0, 100)));
  } else if (data.type === "engawa:cache-status" && typeof data.url === "string" && event.ports[0]) {
    const storedAt = servedFromCache.has(data.url) ? servedFromCache.get(data.url) || null : null;
    event.ports[0].postMessage({ fromCache: servedFromCache.has(data.url), storedAt });
  }
});

async function warm(urls) {
  for (const raw of urls) {
    if (typeof raw !== "string") continue;
    let url;
    try {
      url = new URL(raw, self.location.origin);
    } catch {
      continue;
    }
    const name = cacheFor(url);
    if (!name) continue;
    url.hash = "";
    try {
      if (name === STATIC && (await (await caches.open(STATIC)).match(url.href))) continue;
      const response = await fetch(url.href, { credentials: "same-origin" });
      if (storable(response)) await store(name, url.href, response);
    } catch {
      // Offline again already, or the file is gone: the next visit stores it.
    }
  }
}

/**
 * Web push. The payload is JSON {title, body, url, tag, icon, lang} from
 * lib/push/rules.ts. Every push must show a notification (the browser shows
 * a generic one of its own otherwise), so an unreadable payload still shows
 * the site's name. The tag is one per card (or per board's mode): an update
 * replaces the earlier notification and, with renotify, alerts again.
 */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const text = (value, max) => (typeof value === "string" ? value.slice(0, max) : "");
  const title = text(data.title, 200) || "Engawa";
  const tag = text(data.tag, 80);
  const options = {
    body: text(data.body, 400),
    icon: text(data.icon, 200) || "/icons/192",
    lang: text(data.lang, 16) || undefined,
    data: { url: text(data.url, 500) || "/" },
  };
  if (tag) {
    options.tag = tag;
    options.renotify = true;
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

/** A tap opens the card or board the notification names, on this site only, in an open tab when there is one. */
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let url;
  try {
    url = new URL(event.notification.data?.url ?? "/", self.location.origin);
  } catch {
    url = new URL("/", self.location.origin);
  }
  if (url.origin !== self.location.origin) url = new URL("/", self.location.origin);
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const open = windows.find((client) => new URL(client.url).pathname === url.pathname);
      if (open) {
        await open.focus();
        if ("navigate" in open) await open.navigate(url.href).catch(() => undefined);
        return;
      }
      await self.clients.openWindow(url.href);
    })(),
  );
});
