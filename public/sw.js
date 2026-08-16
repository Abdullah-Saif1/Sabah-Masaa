// App-shell cache for offline use. HTML pages (this app's shell, plus the
// standalone Quran reader) are served network-first, so a fix shipped from
// the server reaches the user on their very next load instead of getting
// stuck behind a stale cache indefinitely -- the cache for these is only a
// fallback for when the network is unavailable. Static assets (fonts,
// bundled Quran data, icons) rarely change and are served cache-first for
// speed and reliable offline use; /api/* is always network-only so sync
// and push subscriptions stay live.
const CACHE_NAME = "sabah-masaa-v2";
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

function isHtmlRequest(request, url) {
  if (request.mode === "navigate") return true;
  if (request.destination === "document") return true;
  return url.pathname === "/" || url.pathname.endsWith(".html");
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return; // never cache sync/push calls

  if (isHtmlRequest(event.request, url)) {
    // Network-first: always try to get the latest page. Only fall back to
    // whatever's cached if the network is genuinely unreachable (offline).
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
    return;
  }

  // Cache-first for static assets: fonts, bundled Quran data, icons, vendor JS.
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
