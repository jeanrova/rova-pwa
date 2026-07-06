/* ROVA PWA service worker — cache-first app shell, fully offline after first load */
const VERSION = "rova-v1";
const ASSETS = ["./","index.html","css/rova.css","js/core.js","js/chamber.js","js/ui.js",
                "manifest.webmanifest","icons/icon-192.png","icons/icon-512.png"];
self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))
  ).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  e.respondWith(caches.match(e.request, {ignoreSearch:true})
    .then(r => r || fetch(e.request)));
});
