/* ROVA PWA service worker — resilient cache-first + runtime caching */
const VERSION = "rova-v2";
const ASSETS = ["./","index.html","css/rova.css","js/core.js","js/chamber.js","js/ui.js",
                "manifest.webmanifest","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c =>
    Promise.allSettled(ASSETS.map(a => c.add(a)))
  ).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit => {
      if (hit) return hit;
      return fetch(e.request).then(resp => {
        if (resp.ok && new URL(e.request.url).origin === location.origin) {
          const copy = resp.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return resp;
      });
    })
  );
});
