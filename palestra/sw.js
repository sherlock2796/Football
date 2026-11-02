const CACHE = "palestra-v3";
const SHELL = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./apple-touch-icon.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("palestra-") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const network = fetch(e.request).then(res => { if (res && (res.ok || res.type === "opaque")) cache.put(e.request, res.clone()); return res; }).catch(() => cached);
    return cached || network;
  }));
});

// ----------------------------- notifiche push (Supabase, funzione "palestra") ---------------
self.addEventListener("push", e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { corpo: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.titolo || "Palestra", {
    body: d.corpo || "",
    icon: "./icon-192.png",
    badge: "./icon-192.png",
    tag: d.tag || "palestra",
    data: { url: d.url || "./" },
  }));
});
self.addEventListener("notificationclick", e => {
  e.notification.close();
  const dest = new URL(e.notification.data?.url || "./", self.registration.scope).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(wins => {
    const w = wins.find(x => x.url.startsWith(self.registration.scope));
    if (w) return w.focus().then(() => (w.navigate ? w.navigate(dest).catch(() => null) : null));
    return self.clients.openWindow(dest);
  }));
});
