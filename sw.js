/* Service worker — SIEMPRE red primero para el HTML, borra caché vieja agresivamente */
const VERSION = "20260722b";
const CACHE = "gv-" + VERSION;
const ESTATICOS = ["./icon-192.png","./icon-512.png","./icon-180.png","./manifest.webmanifest"];

/* Instala y activa inmediatamente sin esperar */
self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ESTATICOS))
      .then(() => self.skipWaiting()) // activa de inmediato, sin esperar
  );
});

/* Al activar: borra TODAS las cachés viejas sin excepción */
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => {
          console.log("[SW] borrando caché vieja:", k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim()) // toma control de todos los tabs abiertos
      .then(() => {
        // Avisa a todos los tabs que se recarguen con la versión nueva
        return self.clients.matchAll({type:"window"}).then(clients =>
          clients.forEach(client => client.postMessage({type:"SW_UPDATED", version:VERSION}))
        );
      })
  );
});

/* Mensajes desde la app */
self.addEventListener("message", e => {
  if (e.data === "skipWaiting" || (e.data && e.data.type === "SKIP_WAITING")) {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  /* No interceptar peticiones externas (Supabase, CDNs) */
  if (url.origin !== location.origin) return;

  const esHTML = req.mode === "navigate" ||
                 (req.headers.get("accept")||"").includes("text/html") ||
                 url.pathname.endsWith(".html");

  if (esHTML) {
    /* HTML: SIEMPRE de la red con no-store, nunca de caché */
    e.respondWith(
      fetch(req, {cache:"no-store"})
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(req, copia)).catch(()=>{});
          return res;
        })
        .catch(() =>
          caches.match(req)
            .then(r => r || caches.match("./index.html"))
            .then(r => r || new Response("Sin conexión", {status:503}))
        )
    );
    return;
  }

  /* Íconos y manifest: caché primero pero actualiza por detrás */
  e.respondWith(
    caches.match(req).then(cached => {
      const red = fetch(req, {cache:"no-store"}).then(res => {
        const copia = res.clone();
        caches.open(CACHE).then(c => c.put(req, copia)).catch(()=>{});
        return res;
      }).catch(() => cached);
      return cached || red;
    })
  );
});
