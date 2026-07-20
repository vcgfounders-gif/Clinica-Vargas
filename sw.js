/* Service worker — SIEMPRE red primero para el HTML (nunca caché vieja).
   La caché solo se usa como respaldo cuando no hay internet. */
const CACHE = "gv-clinica-" + "20260717c";           // cambia en cada versión
const ESTATICOS = ["./icon-192.png", "./icon-512.png", "./icon-180.png", "./manifest.webmanifest"];

self.addEventListener("install", e => {
  // activa la versión nueva de inmediato, sin esperar
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ESTATICOS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))) // borra cachés viejas
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => { if (e.data === "skipWaiting") self.skipWaiting(); });

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // no tocar APIs externas (Supabase, etc.)

  const esHTML = req.mode === "navigate" ||
                 (req.headers.get("accept") || "").includes("text/html") ||
                 url.pathname.endsWith(".html");

  if (esHTML) {
    // HTML: SIEMPRE de la red. Solo si no hay internet, se usa la copia guardada.
    e.respondWith(
      fetch(req, { cache: "no-store" })
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  // Íconos y demás: primero la caché (son fijos), pero se refrescan por detrás
  e.respondWith(
    caches.match(req).then(cached => {
      const red = fetch(req).then(res => {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(req, copia)).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || red;
    })
  );
});
