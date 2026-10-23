/* N-Flow Monteur-App · Service Worker
 * Hält die App-Dateien auf dem Handy, damit sie auch ohne Netz startet.
 * Erst Netz, dann Zwischenspeicher: Updates kommen beim nächsten Öffnen mit Netz automatisch an.
 * Daten (/api/…) laufen nicht hierüber, die speichert die App selbst (Postausgang).
 */
const CACHE = "nflow-app-v4";
const DATEIEN = ["/app/", "/js/nf.js", "/vendor/jsQR.js", "/app/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(DATEIEN)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((k) => Promise.all(k.filter((x) => x !== CACHE).map((x) => caches.delete(x)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  const istSeite = e.request.mode === "navigate";
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        if (r.ok && (istSeite || DATEIEN.includes(url.pathname))) {
          const kopie = r.clone();
          caches.open(CACHE).then((c) => c.put(istSeite ? "/app/" : e.request, kopie));
        }
        return r;
      })
      .catch(() => caches.match(istSeite ? "/app/" : e.request).then((r) => r || caches.match("/app/"))),
  );
});

/* Push-Mitteilungen vom N-Flow-Server */
self.addEventListener("push", (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { text: e.data && e.data.text() }; }
  e.waitUntil(self.registration.showNotification(d.titel || "N-Flow", {
    body: d.text || "", icon: "/icons/icon-192.png", badge: "/icons/icon-192.png",
    tag: d.art || undefined, renotify: !!d.art, data: { ziel: d.ziel || "/app/" },
  }));
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const ziel = (e.notification.data && e.notification.data.ziel) || "/app/";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((liste) => {
    const offen = liste.find((c) => new URL(c.url).pathname.startsWith(ziel));
    if (offen) return offen.focus();
    return self.clients.openWindow(ziel);
  }));
});
