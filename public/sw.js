/*
 * Study OS service worker (registered in production builds only).
 *
 * What works offline:
 *  - Pages you have opened at least once while online (HTML + JS/CSS chunks
 *    are cached as you browse), plus the app shell.
 *  - Your data comes from the IndexedDB snapshot kept by the app; changes made
 *    offline are queued and synced when the connection returns.
 * API calls are never cached here — the app manages its own data cache.
 */
const VERSION = "study-os-v1";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const SHELL = ["/", "/today", "/study", "/revision"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGES)
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return; // data is handled by the app (IndexedDB + sync queue)

  // Immutable build assets: cache first.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/pwa-icon/") || url.pathname === "/icon.svg") {
    event.respondWith(
      caches.open(STATIC).then(async (cache) => {
        const hit = await cache.match(request);
        if (hit) return hit;
        const res = await fetch(request);
        if (res.ok) cache.put(request, res.clone());
        return res;
      }),
    );
    return;
  }

  // Page navigations: network first, fall back to the cached page or the app shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) caches.open(PAGES).then((c) => c.put(request, res.clone()));
          return res;
        })
        .catch(async () => {
          const cache = await caches.open(PAGES);
          return (await cache.match(request)) || (await cache.match("/today")) || (await cache.match("/")) || Response.error();
        }),
    );
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const client = clients.find((c) => "focus" in c);
      if (client) return client.focus();
      return self.clients.openWindow("/");
    }),
  );
});
