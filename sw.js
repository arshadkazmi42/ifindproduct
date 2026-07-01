const CACHE_NAME = 'ifound-v21';
const DATA_CACHE = 'ifound-data-v1';
// One codebase, two hosts: ifound.today serves the landing at / and the feed at
// /feed/; products.ifound.today serves the feed at / (no /feed/ there). Precache
// per-asset and skip misses so a 404 on one host doesn't fail the whole install.
const ASSETS = ['/', '/feed/', '/style.css', '/app.js', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(c =>
      Promise.all(ASSETS.map(a => c.add(a).catch(() => null)))
    )
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME && k !== DATA_CACHE).map(k => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // products.json (~1MB): stale-while-revalidate — serve the cached copy instantly
  // and refresh it in the background, so repeat visits don't wait on the download.
  // The data updates at most daily, so one-visit-stale is fine.
  if (url.pathname === '/data/products.json') {
    e.respondWith(
      caches.open(DATA_CACHE).then(async cache => {
        const cached = await cache.match(e.request);
        const network = fetch(e.request).then(res => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // App shell: network-first so deploys show up immediately; cached copy keeps
  // the app working offline.
  e.respondWith(
    fetch(e.request).then(res => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() =>
      caches.match(e.request).then(hit => {
        if (hit) return hit;
        // Offline navigation to an uncached URL → nearest precached page.
        if (e.request.mode === 'navigate') {
          return caches.match(url.pathname.startsWith('/feed') ? '/feed/' : '/')
            .then(page => page || caches.match('/'))
            .then(page => page || Response.error());
        }
        return Response.error();
      })
    )
  );
});
