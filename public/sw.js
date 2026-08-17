// App-shell cache for offline use. Only truly-immutable assets (fonts,
// icons -- files whose bytes never change once published) are served
// cache-first. Everything else -- HTML pages, bundled Quran data,
// manifest, vendor JS -- is network-first: always try the network for the
// latest version, falling back to cache only when genuinely offline. This
// matters for correctness, not just freshness: quran-uthmani.json holds
// the actual Quranic text, and a stale cached copy of it is a silent data
// bug, not just an outdated page. /api/* is always network-only so sync
// and push subscriptions stay live.
const CACHE_NAME = "sabah-masaa-v3";
const SHELL = [
  "/",
  "/index.html",
  "/quran-reader.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  let data = { title: "Sabah & Masaa", body: "It's prayer time.", prayer: "" };
  if (event.data) {
    try { data = Object.assign(data, event.data.json()); } catch (e) {}
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "prayer-" + (data.prayer || "reminder"),
      data: { url: "/#prayer" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) { client.navigate(url); return client.focus(); }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});

// Only assets whose bytes are truly fixed for a given filename: web fonts
// and app icons. If a font or icon ever needs to change, it should ship
// under a new filename -- don't add anything here that might need an
// in-place content fix later.
function isImmutableAsset(url) {
  return url.pathname.startsWith("/fonts/") || url.pathname.startsWith("/icons/");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return; // never cache sync/push calls

  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        });
      })
    );
    return;
  }

  // Network-first for everything else: HTML pages, bundled Quran/prayer
  // data, manifest, vendor JS. Only falls back to cache when offline.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
