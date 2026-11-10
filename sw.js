// sw.js: offline support. Network-first (always fresh when online), cache fallback when offline.
// Bump VERSION when you change the file list.
const VERSION = "pitwall-v1";
const SHELL = [
  "./", "index.html", "manifest.webmanifest", "css/theme.css", "css/app.css",
  "js/app.js", "js/engine.js", "js/store.js", "js/util.js", "js/seed-syllabus.js",
  "js/ui/common.js", "js/ui/race.js", "js/ui/log.js", "js/ui/sectors.js", "js/ui/calendar.js",
  "js/ui/telemetry.js", "js/ui/strategy.js", "js/ui/share.js", "js/ui/notify.js", "js/ui/onboarding.js",
  "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok && (new URL(req.url).origin === location.origin || req.url.includes("fonts."))) {
        const copy = res.clone();
        caches.open(VERSION).then((c) => c.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("index.html")))
  );
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => (cs[0] ? cs[0].focus() : self.clients.openWindow("./"))));
});
